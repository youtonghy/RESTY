import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import type { TimerPhase } from '../types';
import * as api from '../utils/api';
import './Dashboard.css';

type SlotType = Extract<TimerPhase, 'work' | 'break'>;

interface PlaceholderSlot {
  id: string;
  type: SlotType;
  start: Date;
}

interface NextSlot {
  type: SlotType;
  start: Date;
  source: 'timer' | 'schedule';
}

const SHIFT_BLUEPRINT: Array<{ type: SlotType; hour: number; minute: number }> = [
  { type: 'work', hour: 9, minute: 0 },
  { type: 'break', hour: 11, minute: 30 },
  { type: 'work', hour: 13, minute: 30 },
  { type: 'break', hour: 16, minute: 0 },
];

const TIP_LIBRARY: Record<'zh' | 'en', string[]> = {
  zh: [
    '遵循20-20-20法则，每20分钟远眺20秒。',
    '显示器亮度略高于环境，减少瞳孔疲劳。',
    '每小时起身伸展肩颈，缓解肌肉紧绷。',
    '保持眨眼频率，每次眨眼都让角膜滋润。',
    '饮水分散在全天，维持泪膜稳定。',
    '屏幕顶部略低于视线，放松颈部发力。',
    '午后开启暖色温模式，柔化蓝光刺激。',
    '阅读合适字号，避免眼睛长时间聚焦。',
  ],
  en: [
    'Follow the 20-20-20 rule; focus far regularly.',
    'Align screen brightness with ambient light levels.',
    'Blink deliberately ten times each hour to refresh tears.',
    'Keep monitor top slightly below relaxed eye level.',
    'Stand and stretch every 60 minutes to relax posture.',
    'Sip water often to keep your tear film stable.',
    'Enable night mode after sunset to soften blue light.',
    'Increase text size to avoid squinting or leaning in.',
  ],
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const joinParts = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(' · ');

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
};

const getStartOfWeek = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = (day + 6) % 7; // ISO week: Monday = 0
  start.setDate(start.getDate() - diff);
  return start;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getProgressBetween = (start: Date, end: Date, current: Date) => {
  const total = end.getTime() - start.getTime();
  if (total <= 0) {
    return 0;
  }
  return clamp01((current.getTime() - start.getTime()) / total);
};

const generatePlaceholderSlots = (reference: Date): PlaceholderSlot[] => {
  const startOfDay = new Date(reference);
  startOfDay.setHours(0, 0, 0, 0);

  const slots: PlaceholderSlot[] = [];
  for (let dayOffset = 0; dayOffset < 4; dayOffset += 1) {
    SHIFT_BLUEPRINT.forEach((blueprint, index) => {
      const start = new Date(startOfDay);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(blueprint.hour, blueprint.minute, 0, 0);
      slots.push({
        id: `${blueprint.type}-${dayOffset}-${index}`,
        type: blueprint.type,
        start,
      });
    });
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
};

const generateTip = (language: string): string => {
  const key: 'zh' | 'en' = language.startsWith('zh') ? 'zh' : 'en';
  const pool = TIP_LIBRARY[key];
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
};

type CardId = 'status' | 'next' | 'day' | 'week' | 'month' | 'year' | 'tips';

interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

type LayoutMap = Record<CardId, LayoutItem>;

interface GridMetrics {
  trackWidth: number;
  trackHeight: number;
  columnGap: number;
  rowGap: number;
  columnSpan: number;
  rowSpan: number;
}

const GRID_COLUMNS = 12;
const BASE_SPAN = 2;
const MIN_TRACK_HEIGHT = 160;
const HEIGHT_RATIO = 0.8;

const CARD_LIMITS: Record<CardId, { minW: number; minH: number; initial: LayoutItem }> = {
  status: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: 0, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  next: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: BASE_SPAN, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  day: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: BASE_SPAN * 2, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  week: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: BASE_SPAN * 3, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  month: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: BASE_SPAN * 4, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  year: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: BASE_SPAN * 5, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  tips: {
    minW: BASE_SPAN * 2,
    minH: BASE_SPAN,
    initial: { x: 0, y: BASE_SPAN, w: BASE_SPAN * 2, h: BASE_SPAN },
  },
};

const createInitialLayout = (): LayoutMap => {
  return Object.fromEntries(
    Object.entries(CARD_LIMITS).map(([key, value]) => [key, { ...value.initial }])
  ) as LayoutMap;
};

const clampLayout = (id: CardId, candidate: LayoutItem): LayoutItem => {
  const limits = CARD_LIMITS[id];

  let width = Math.max(limits.minW, Math.min(candidate.w, GRID_COLUMNS));
  let x = Math.max(0, Math.min(candidate.x, GRID_COLUMNS - width));
  width = Math.min(width, GRID_COLUMNS - x);

  const height = Math.max(limits.minH, candidate.h);
  const y = Math.max(0, candidate.y);

  return { x, y, w: width, h: height };
};

const rectanglesOverlap = (a: LayoutItem, b: LayoutItem) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const layoutHasCollision = (id: CardId, candidate: LayoutItem, state: LayoutMap) => {
  return Object.entries(state).some(([key, item]) => {
    if (key === id) return false;
    return rectanglesOverlap(candidate, item);
  });
};

// Relative time display not used in simplified next-slot card

function useFadeInOnScroll<T extends HTMLElement>(delay: number) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--tile-delay', `${delay}ms`);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [delay]);

  return ref;
}

// Title component removed per simplification


interface FeatureCardProps {
  primary: string;
  label: string;
  icon?: string;
  delay?: number;
  children?: ReactNode;
  progress?: number; // 0..1 (optional) — when provided, card background fills as progress
  className?: string;
  style?: CSSProperties;
}

function FeatureCard({ primary, label, icon, delay = 0, children, progress, className, style }: FeatureCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);
  const classes = [
    `tile-card`,
    className,
    progress !== undefined ? 'has-progress' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const computedStyle =
    progress !== undefined
      ? ({
          ['--progress' as any]: String(clamp01(progress)),
          ...(style as CSSProperties | undefined),
        } as CSSProperties)
      : (style as CSSProperties | undefined);

  return (
    <section ref={ref} className={classes} style={computedStyle} tabIndex={0} role="listitem">
      <div className="tile-primary-row">
        {icon && (
          <span className="tile-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <span className="tile-primary">{primary}</span>
      </div>
      <div className="tile-label">{label}</div>
      {children}
    </section>
  );
}

interface PercentCardProps {
  value: number;
  label: string;
  info?: string;
  formatted: string;
  delay?: number;
}

function PercentCard({ value, label, info, formatted, delay = 0 }: PercentCardProps) {
  return (
    <FeatureCard
      primary={formatted}
      label={joinParts([label, info])}
      icon="⏱"
      progress={clamp01(value)}
      delay={delay}
    />
  );
}

interface NextSlotCardProps {
  primary: string;
  secondary: string;
  delay?: number;
}

function NextSlotCard({ primary, secondary, delay = 0 }: NextSlotCardProps) {
  return <FeatureCard primary={primary} label={secondary} icon="🗓" delay={delay} />;
}

interface TipsCardProps {
  tip: string;
  title: string;
  delay?: number;
}

function TipsCard({ tip, title, delay = 0 }: TipsCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);

  return (
    <section ref={ref} className="tile-card tips-card" tabIndex={0} role="listitem">
      <div className="tile-primary-row">
        <span className="tile-icon" aria-hidden="true">
          👀
        </span>
        <span className="tile-primary">{title}</span>
      </div>
      <div className="tips-content">
        <span className="tips-text">{tip}</span>
      </div>
    </section>
  );
}

/**
 * 仪表盘页面：苹果发布会信息卡拼贴风格的番茄工作状态总览。
 */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const { timerInfo, setTimerInfo } = useAppStore();
  const [now, setNow] = useState(() => new Date());
  const [tip] = useState(() => generateTip(i18n.language));

  const [layout, setLayout] = useState<LayoutMap>(() => createInitialLayout());
  const [metrics, setMetrics] = useState<GridMetrics>(() => ({
    trackWidth: 0,
    trackHeight: MIN_TRACK_HEIGHT,
    columnGap: 24,
    rowGap: 24,
    columnSpan: 24,
    rowSpan: MIN_TRACK_HEIGHT + 24,
  }));
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.getTimerInfo().then(setTimerInfo).catch((error) => {
      console.error('Failed to load timer info:', error);
    });

    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      unsubscribe = await api.onTimerUpdate((info) => {
        setTimerInfo(info);
      });
    };

    setup();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [setTimerInfo]);

  useEffect(() => {
    // 每秒刷新一次，确保倒计时显示顺畅
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);

  
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const placeholderSlots = useMemo(() => generatePlaceholderSlots(now), [dateKey]);

  // 计算“下次休息”的时间：优先使用后端提供的 nextBreakTime（已考虑抑制逻辑），否则回退到占位日程中的下一段 break
  const nextBreakSlot = useMemo<NextSlot | null>(() => {
    const raw = timerInfo.nextBreakTime as unknown as string | null | undefined;
    if (raw) {
      const start = new Date(raw);
      if (!Number.isNaN(start.getTime())) {
        return { type: 'break', start, source: 'timer' };
      }
    }
    // fallback: use the next placeholder break slot after now
    const upcomingBreak = placeholderSlots.find(
      (slot) => slot.type === 'break' && slot.start.getTime() > now.getTime()
    );
    return upcomingBreak
      ? { type: 'break', start: upcomingBreak.start, source: 'schedule' }
      : null;
  }, [timerInfo, placeholderSlots, now]);

  const dayProgress = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 1);
    return getProgressBetween(start, end, now);
  }, [now]);

  const weekProgress = useMemo(() => {
    const start = getStartOfWeek(now);
    const end = addDays(start, 7);
    return getProgressBetween(start, end, now);
  }, [now]);

  const monthProgress = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return getProgressBetween(start, end, now);
  }, [now]);

  const yearProgress = useMemo(() => {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return getProgressBetween(start, end, now);
  }, [now]);

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [i18n.language]
  );

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [i18n.language]
  );

  const heroClockFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [i18n.language]
  );

  const heroDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    [i18n.language]
  );

  const statusContent = useMemo(() => {
    if (timerInfo.state === 'running' && timerInfo.phase === 'work') {
      return {
        primary: t('dashboard.status.work.primary', { defaultValue: isZh ? '工作中' : 'In focus' }),
        label: t('dashboard.status.work.label', {
          defaultValue: isZh ? '保持专注，完成当下任务。' : 'Deep focus in progress.',
        }),
        icon: '🔵',
      };
    }
    if (timerInfo.state === 'running' && timerInfo.phase === 'break') {
      return {
        primary: t('dashboard.status.break.primary', { defaultValue: isZh ? '休息中' : 'On break' }),
        label: t('dashboard.status.break.label', {
          defaultValue: isZh ? '舒展肩颈，喝口水补充能量。' : 'Loosen up and hydrate.',
        }),
        icon: '🟢',
      };
    }
    if (timerInfo.state === 'paused') {
      return {
        primary: t('dashboard.status.paused.primary', { defaultValue: isZh ? '已暂停' : 'Paused' }),
        label: t('dashboard.status.paused.label', {
          defaultValue: isZh ? '随时继续，别忘记调整状态。' : 'Ready to resume when you are.',
        }),
        icon: '🟡',
      };
    }
    if (timerInfo.state === 'stopped' && timerInfo.phase === 'idle') {
      return {
        primary: t('dashboard.status.idle.primary', { defaultValue: isZh ? '待命' : 'Idle' }),
        label: t('dashboard.status.idle.label', {
          defaultValue: isZh ? '下一段节奏尚未开始。' : 'Awaiting the next rhythm.',
        }),
        icon: '⚪',
      };
    }
    return {
      primary: t('dashboard.status.offline.primary', { defaultValue: isZh ? '离线' : 'Offline' }),
      label: t('dashboard.status.offline.label', {
        defaultValue: isZh ? '番茄钟静默，随时准备启动。' : 'Pomodoro is standing by.',
      }),
      icon: '⚫',
    };
  }, [t, timerInfo.state, timerInfo.phase, isZh]);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  // Next break display: show countdown instead of absolute time
  const nextPrimary = nextBreakSlot
    ? formatCountdown(nextBreakSlot.start.getTime() - now.getTime())
    : '—';
  const slotTypeLabel = nextBreakSlot
    ? t('dashboard.next.break', { defaultValue: isZh ? '下次休息' : 'Next break' })
    : t('dashboard.next.none', { defaultValue: isZh ? '未计划' : 'No schedule' });
  // Only show the label (e.g., Next break), hide source/relative/timezone
  const nextSecondary = slotTypeLabel;

  // Title/subtitle removed per optimization request
  const heroClock = heroClockFormatter.format(now);
  const heroDate = heroDateFormatter.format(now);

  const dayLabel = t('dashboard.progress.day.label', {
    defaultValue: isZh ? '今天进度' : 'Today progress',
  });
  const weekLabel = t('dashboard.progress.week.label', {
    defaultValue: isZh ? '本周进度' : 'Week progress',
  });
  const monthLabel = t('dashboard.progress.month.label', {
    defaultValue: isZh ? '本月进度' : 'Month progress',
  });
  const yearLabel = t('dashboard.progress.year.label', {
    defaultValue: isZh ? '今年进度' : 'Year progress',
  });

  const dayInfo = timeFormatter.format(now);

  const tipsTitle = t('dashboard.tips.title', {
    defaultValue: isZh ? '护眼技巧' : 'Eye-care tips',
  });

  const attemptUpdate = useCallback(
    (id: CardId, candidate: LayoutItem) => {
      let applied = false;
      setLayout((prev) => {
        const current = prev[id];
        if (!current) return prev;

        const normalized = clampLayout(id, candidate);

        if (
          current.x === normalized.x &&
          current.y === normalized.y &&
          current.w === normalized.w &&
          current.h === normalized.h
        ) {
          return prev;
        }

        if (layoutHasCollision(id, normalized, prev)) {
          return prev;
        }

        applied = true;
        return { ...prev, [id]: normalized };
      });

      return applied;
    },
    []
  );

  useEffect(() => {
    const node = gridRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const width = entry.contentRect.width;
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : width;
      const gap = Math.max(18, Math.min(28, viewportWidth * 0.02));
      const columnGap = gap;
      const rowGap = gap;
      const baseWidth = (width - columnGap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
      const trackWidth = Number.isFinite(baseWidth) ? Math.max(48, baseWidth) : 48;
      const trackHeight = Math.max(MIN_TRACK_HEIGHT, trackWidth * HEIGHT_RATIO);

      setMetrics({
        trackWidth,
        trackHeight,
        columnGap,
        rowGap,
        columnSpan: trackWidth + columnGap,
        rowSpan: trackHeight + rowGap,
      });
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const gridStyle: CSSProperties = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
      gridAutoRows: `${metrics.trackHeight}px`,
      columnGap: `${metrics.columnGap}px`,
      rowGap: `${metrics.rowGap}px`,
    }),
    [metrics]
  );

  const cards = useMemo(() => {
    return [
      {
        id: 'status' as const,
        minW: CARD_LIMITS.status.minW,
        minH: CARD_LIMITS.status.minH,
        element: (
          <FeatureCard
            primary={statusContent.primary}
            label={statusContent.label}
            icon={statusContent.icon}
            delay={0}
          />
        ),
      },
      {
        id: 'next' as const,
        minW: CARD_LIMITS.next.minW,
        minH: CARD_LIMITS.next.minH,
        element: <NextSlotCard primary={nextPrimary} secondary={nextSecondary} delay={60} />,
      },
      {
        id: 'day' as const,
        minW: CARD_LIMITS.day.minW,
        minH: CARD_LIMITS.day.minH,
        element: (
          <PercentCard
            value={dayProgress}
            formatted={percentFormatter.format(dayProgress)}
            label={dayLabel}
            info={dayInfo}
            delay={120}
          />
        ),
      },
      {
        id: 'week' as const,
        minW: CARD_LIMITS.week.minW,
        minH: CARD_LIMITS.week.minH,
        element: (
          <PercentCard
            value={weekProgress}
            formatted={percentFormatter.format(weekProgress)}
            label={weekLabel}
            delay={180}
          />
        ),
      },
      {
        id: 'month' as const,
        minW: CARD_LIMITS.month.minW,
        minH: CARD_LIMITS.month.minH,
        element: (
          <PercentCard
            value={monthProgress}
            formatted={percentFormatter.format(monthProgress)}
            label={monthLabel}
            delay={240}
          />
        ),
      },
      {
        id: 'year' as const,
        minW: CARD_LIMITS.year.minW,
        minH: CARD_LIMITS.year.minH,
        element: (
          <PercentCard
            value={yearProgress}
            formatted={percentFormatter.format(yearProgress)}
            label={yearLabel}
            delay={300}
          />
        ),
      },
      {
        id: 'tips' as const,
        minW: CARD_LIMITS.tips.minW,
        minH: CARD_LIMITS.tips.minH,
        element: <TipsCard tip={tip} title={tipsTitle} delay={360} />,
      },
    ];
  }, [
    dayInfo,
    dayLabel,
    dayProgress,
    monthLabel,
    monthProgress,
    nextPrimary,
    nextSecondary,
    percentFormatter,
    statusContent,
    tip,
    tipsTitle,
    weekLabel,
    weekProgress,
    yearLabel,
    yearProgress,
  ]);

  const renderCards = cards.map((card) => {
    const item = layout[card.id] ?? CARD_LIMITS[card.id].initial;
    return (
      <DraggableCard
        key={card.id}
        id={card.id}
        item={item}
        minW={card.minW}
        minH={card.minH}
        metrics={metrics}
        onChange={attemptUpdate}
      >
        {card.element}
      </DraggableCard>
    );
  });

  return (
    <div className="dashboard-page">
      <div className="dashboard-content">
        <header className="dashboard-header">
          <div className="header-main">
            <div className="hero-meta">
              <span className="hero-clock">{heroClock}</span>
              <div className="hero-meta-row">
                <span className="hero-date">{heroDate}</span>
                <span className="hero-tz">{timezone}</span>
              </div>
            </div>
            {/* Title/subtitle intentionally removed */}
          </div>
        </header>

        <div className="dashboard-grid" ref={gridRef} role="list" style={gridStyle}>
          {renderCards}
        </div>
      </div>
    </div>
  );
}

interface DraggableCardProps {
  id: CardId;
  item: LayoutItem;
  minW: number;
  minH: number;
  metrics: GridMetrics;
  children: ReactNode;
  onChange: (id: CardId, candidate: LayoutItem) => boolean;
}

function DraggableCard({ id, item, metrics, children, onChange, minW, minH }: DraggableCardProps) {
  const [mode, setMode] = useState<'idle' | 'dragging' | 'resizing'>('idle');

  const applyWithBounds = useCallback(
    (candidate: LayoutItem) => {
      const normalized = {
        x: candidate.x,
        y: candidate.y,
        w: Math.max(minW, candidate.w),
        h: Math.max(minH, candidate.h),
      };
      if (
        !Number.isFinite(normalized.x) ||
        !Number.isFinite(normalized.y) ||
        !Number.isFinite(normalized.w) ||
        !Number.isFinite(normalized.h)
      ) {
        return;
      }
      onChange(id, normalized);
    },
    [id, minH, minW, onChange]
  );

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== 'idle') return;
      if (metrics.columnSpan <= 0 || metrics.rowSpan <= 0) return;
      event.preventDefault();

      const node = event.currentTarget;
      node.setPointerCapture(event.pointerId);
      setMode('dragging');

      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        original: { ...item },
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - start.pointerX;
        const deltaY = moveEvent.clientY - start.pointerY;

        const next: LayoutItem = {
          x: Math.round(start.original.x + deltaX / metrics.columnSpan),
          y: Math.round(start.original.y + deltaY / metrics.rowSpan),
          w: start.original.w,
          h: start.original.h,
        };

        applyWithBounds(next);
      };

      const handleEnd = () => {
        node.removeEventListener('pointermove', handleMove);
        node.removeEventListener('pointerup', handleEnd);
        node.removeEventListener('pointercancel', handleEnd);
        try {
          node.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* ignore */
        }
        setMode('idle');
      };

      node.addEventListener('pointermove', handleMove);
      node.addEventListener('pointerup', handleEnd, { once: true });
      node.addEventListener('pointercancel', handleEnd, { once: true });
    },
    [applyWithBounds, item, metrics, mode]
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (metrics.columnSpan <= 0 || metrics.rowSpan <= 0) return;

      const node = event.currentTarget;
      node.setPointerCapture(event.pointerId);
      setMode('resizing');

      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        original: { ...item },
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - start.pointerX;
        const deltaY = moveEvent.clientY - start.pointerY;

        const next: LayoutItem = {
          x: start.original.x,
          y: start.original.y,
          w: Math.round(start.original.w + deltaX / metrics.columnSpan),
          h: Math.round(start.original.h + deltaY / metrics.rowSpan),
        };

        applyWithBounds(next);
      };

      const handleEnd = () => {
        node.removeEventListener('pointermove', handleMove);
        node.removeEventListener('pointerup', handleEnd);
        node.removeEventListener('pointercancel', handleEnd);
        try {
          node.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* ignore */
        }
        setMode('idle');
      };

      node.addEventListener('pointermove', handleMove);
      node.addEventListener('pointerup', handleEnd, { once: true });
      node.addEventListener('pointercancel', handleEnd, { once: true });
    },
    [applyWithBounds, item, metrics]
  );

  const classes = useMemo(() => {
    const base = ['draggable-card'];
    if (mode === 'dragging') base.push('is-dragging');
    if (mode === 'resizing') base.push('is-resizing');
    return base.join(' ');
  }, [mode]);

  return (
    <div
      className={classes}
      onPointerDown={handleDragStart}
      style={{
        gridColumnStart: item.x + 1,
        gridColumnEnd: `span ${Math.max(minW, item.w)}`,
        gridRowStart: item.y + 1,
        gridRowEnd: `span ${Math.max(minH, item.h)}`,
        touchAction: 'none',
      }}
    >
      {children}
      <div className="card-resize-handle" aria-hidden="true" onPointerDown={handleResizeStart} />
    </div>
  );
}

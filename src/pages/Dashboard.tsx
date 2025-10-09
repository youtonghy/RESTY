import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
  span?: 4 | 12;
  delay?: number;
  children?: ReactNode;
  progress?: number; // 0..1 (optional) — when provided, card background fills as progress
}

function FeatureCard({ primary, label, icon, span = 4, delay = 0, children, progress }: FeatureCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);
  const classes = [
    `tile-card`,
    `tile-span-${span}`,
    progress !== undefined ? 'has-progress' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const style =
    progress !== undefined
      ? ({ ['--progress' as any]: String(clamp01(progress)) } as CSSProperties)
      : undefined;

  return (
    <section ref={ref} className={classes} style={style} tabIndex={0} role="listitem">
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
    <section ref={ref} className="tile-card tile-span-12 tips-card" tabIndex={0} role="listitem">
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

  // For next break/work display, only show HH:MM (no date)
  const hourMinuteFormatter = useMemo(
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

        <div className="dashboard-grid" role="list">
          <FeatureCard
            primary={statusContent.primary}
            label={statusContent.label}
            icon={statusContent.icon}
            delay={0}
          />

          <NextSlotCard primary={nextPrimary} secondary={nextSecondary} delay={60} />

          <PercentCard
            value={dayProgress}
            formatted={percentFormatter.format(dayProgress)}
            label={dayLabel}
            info={dayInfo}
            delay={120}
          />

          <PercentCard
            value={weekProgress}
            formatted={percentFormatter.format(weekProgress)}
            label={weekLabel}
            delay={180}
          />

          <PercentCard
            value={monthProgress}
            formatted={percentFormatter.format(monthProgress)}
            label={monthLabel}
            delay={240}
          />

          <PercentCard
            value={yearProgress}
            formatted={percentFormatter.format(yearProgress)}
            label={yearLabel}
            delay={300}
          />

          <TipsCard
            tip={tip}
            title={tipsTitle}
            delay={360}
          />
        </div>
      </div>
    </div>
  );
}

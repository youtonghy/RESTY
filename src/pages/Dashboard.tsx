import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import { useTheme } from '../components/Common/ThemeProvider';
import type { Theme, TimerPhase } from '../types';
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

const shuffle = <T,>(items: T[]): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const generateTips = (language: string): string[] => {
  const key: 'zh' | 'en' = language.startsWith('zh') ? 'zh' : 'en';
  const pool = shuffle(TIP_LIBRARY[key]);
  const count = Math.min(pool.length, Math.floor(Math.random() * 4) + 3); // 3-6
  return pool.slice(0, count);
};

const formatRelativeTime = (target: Date, base: Date, locale: string) => {
  const diff = target.getTime() - base.getTime();
  const abs = Math.abs(diff);
  if (abs < 1000) {
    return locale.startsWith('zh') ? '就在现在' : 'now';
  }
  const table: Array<{ limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }>
    = [
      { limit: 60_000, divisor: 1_000, unit: 'second' },
      { limit: 3_600_000, divisor: 60_000, unit: 'minute' },
      { limit: 86_400_000, divisor: 3_600_000, unit: 'hour' },
      { limit: 604_800_000, divisor: 86_400_000, unit: 'day' },
      { limit: Infinity, divisor: 604_800_000, unit: 'week' },
    ];

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const sign = diff < 0 ? -1 : 1;

  for (const entry of table) {
    if (abs < entry.limit) {
      const value = Math.round((abs / entry.divisor)) * sign;
      return rtf.format(value, entry.unit);
    }
  }
  return rtf.format(Math.round((abs / 604_800_000)) * (diff < 0 ? -1 : 1), 'week');
};

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

function GradientTitle({ children }: { children: ReactNode }) {
  return <h1 className="dashboard-gradient-title">{children}</h1>;
}

function ThemeToggle({ theme, onChange }: { theme: Theme; onChange: (value: Theme) => void }) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const options: Array<{ value: Theme; label: string; icon: string }> = [
    {
      value: 'auto',
      icon: '🧭',
      label: t('dashboard.theme.auto', { defaultValue: isZh ? '系统' : 'System' }),
    },
    {
      value: 'light',
      icon: '🌞',
      label: t('dashboard.theme.light', { defaultValue: isZh ? '浅色' : 'Light' }),
    },
    {
      value: 'dark',
      icon: '🌙',
      label: t('dashboard.theme.dark', { defaultValue: isZh ? '深色' : 'Dark' }),
    },
  ];

  return (
    <div
      className="theme-toggle"
      role="radiogroup"
      aria-label={t('dashboard.theme.toggle', { defaultValue: isZh ? '主题模式' : 'Theme mode' })}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          className={`theme-toggle-option${theme === option.value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          <span aria-hidden="true">{option.icon}</span>
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

interface FeatureCardProps {
  primary: string;
  label: string;
  icon?: string;
  span?: 4 | 12;
  delay?: number;
  children?: ReactNode;
}

function FeatureCard({ primary, label, icon, span = 4, delay = 0, children }: FeatureCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);
  const classes = [`tile-card`, `tile-span-${span}`].join(' ');

  return (
    <section ref={ref} className={classes} tabIndex={0} role="listitem">
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
  const barWidth = `${Math.round(clamp01(value) * 100)}%`;
  return (
    <FeatureCard
      primary={formatted}
      label={joinParts([label, info])}
      icon="⏱"
      delay={delay}
    >
      <div className="tile-progress" role="presentation">
        <span className="tile-progress-bar" style={{ width: barWidth }} />
      </div>
    </FeatureCard>
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
  tips: string[];
  title: string;
  subtitle: string;
  buttonLabel: string;
  onShuffle: () => void;
  delay?: number;
}

function TipsCard({ tips, title, subtitle, buttonLabel, onShuffle, delay = 0 }: TipsCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);

  return (
    <section ref={ref} className="tile-card tile-span-12 tips-card" tabIndex={0} role="listitem">
      <div className="tips-header">
        <div className="tile-primary-row">
          <span className="tile-icon" aria-hidden="true">
            👀
          </span>
          <span className="tile-primary">{title}</span>
        </div>
        <button type="button" className="tips-shuffle" onClick={onShuffle}>
          {buttonLabel}
        </button>
      </div>
      <div className="tile-label tips-subtitle">{subtitle}</div>
      <ul className="tips-list">
        {tips.map((tip, index) => (
          <li key={`${tip}-${index}`} className="tips-item">
            <span className="tips-index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="tips-text">{tip}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 仪表盘页面：苹果发布会信息卡拼贴风格的番茄工作状态总览。
 */
export function Dashboard() {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const { theme, setTheme, effectiveTheme } = useTheme();
  const { timerInfo, setTimerInfo } = useAppStore();
  const [now, setNow] = useState(() => new Date());
  const [tips, setTips] = useState(() => generateTips(i18n.language));

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
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setTips(generateTips(i18n.language));
  }, [i18n.language]);

  const handleShuffleTips = useCallback(() => {
    setTips(generateTips(i18n.language));
  }, [i18n.language]);

  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const placeholderSlots = useMemo(() => generatePlaceholderSlots(now), [dateKey]);

  const nextSlotFromTimer = useMemo<NextSlot | null>(() => {
    if (!timerInfo.nextTransitionTime) {
      return null;
    }
    const start = new Date(timerInfo.nextTransitionTime);
    if (Number.isNaN(start.getTime())) {
      return null;
    }
    let type: SlotType = 'work';
    if (timerInfo.phase === 'work') {
      type = 'break';
    } else if (timerInfo.phase === 'break') {
      type = 'work';
    }
    return { type, start, source: 'timer' };
  }, [timerInfo.nextTransitionTime, timerInfo.phase]);

  const nextSlot = useMemo<NextSlot | null>(() => {
    if (nextSlotFromTimer) {
      return nextSlotFromTimer;
    }
    const upcoming = placeholderSlots.find((slot) => slot.start.getTime() > now.getTime());
    return upcoming ? { type: upcoming.type, start: upcoming.start, source: 'schedule' } : null;
  }, [nextSlotFromTimer, placeholderSlots, now]);

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
      }),
    [i18n.language]
  );

  const dateTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language]
  );

  const heroFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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

  const nextPrimary = nextSlot ? dateTimeFormatter.format(nextSlot.start) : '—';
  const slotTypeLabel = nextSlot
    ? nextSlot.type === 'work'
      ? t('dashboard.next.work', { defaultValue: isZh ? '下次工作' : 'Next work' })
      : t('dashboard.next.break', { defaultValue: isZh ? '下次休息' : 'Next break' })
    : t('dashboard.next.none', { defaultValue: isZh ? '未计划' : 'No schedule' });
  const slotSourceLabel = nextSlot
    ? nextSlot.source === 'timer'
      ? t('dashboard.next.source.timer', { defaultValue: isZh ? '计时器' : 'Timer' })
      : t('dashboard.next.source.schedule', { defaultValue: isZh ? '预设' : 'Plan' })
    : null;
  const slotRelative = nextSlot ? formatRelativeTime(nextSlot.start, now, i18n.language) : null;
  const nextSecondary = joinParts([slotTypeLabel, slotSourceLabel, slotRelative, timezone]);

  const headerTitle = t('dashboard.hero.title', {
    defaultValue: isZh ? '节奏控制中心' : 'Rhythm Control Center',
  });
  const headerSubtitle = t('dashboard.hero.subtitle', {
    defaultValue: isZh ? '沉浸式掌控专注、休息与健康' : 'Orchestrate focus, rest, and clarity',
  });
  const headerTime = heroFormatter.format(now);

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

  const dayInfo = `${timeFormatter.format(now)}`;
  const weekInfo = isZh ? '周一 00:00 起算' : 'Starts Monday 00:00';
  const monthInfo = isZh ? '月初 00:00 起算' : 'Month begins at 00:00';
  const yearInfo = isZh ? '元旦 00:00 起算' : 'Year begins at 00:00';

  const tipsButtonLabel = t('dashboard.tips.shuffle', {
    defaultValue: isZh ? '换一批' : 'Refresh tips',
  });
  const tipsTitle = t('dashboard.tips.title', {
    defaultValue: isZh ? '护眼技巧' : 'Eye-care tips',
  });
  const tipsSubtitle = isZh
    ? `AI 生成 · ${tips.length} 条`
    : `AI generated · ${tips.length} tips`;

  return (
    <div className={`dashboard-page theme-${effectiveTheme}`}>
      <div className="dashboard-atmosphere" aria-hidden="true" />
      <div className="dashboard-content">
        <header className="dashboard-header">
          <div className="header-text">
            <GradientTitle>{headerTitle}</GradientTitle>
            <p className="header-subtitle">{headerSubtitle}</p>
          </div>
          <div className="header-meta">
            <span className="header-clock">{headerTime}</span>
            <span className="header-tz">{timezone}</span>
          </div>
          <ThemeToggle theme={theme} onChange={setTheme} />
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
            info={weekInfo}
            delay={180}
          />

          <PercentCard
            value={monthProgress}
            formatted={percentFormatter.format(monthProgress)}
            label={monthLabel}
            info={monthInfo}
            delay={240}
          />

          <PercentCard
            value={yearProgress}
            formatted={percentFormatter.format(yearProgress)}
            label={yearLabel}
            info={yearInfo}
            delay={300}
          />

          <TipsCard
            tips={tips}
            title={tipsTitle}
            subtitle={tipsSubtitle}
            buttonLabel={tipsButtonLabel}
            onShuffle={handleShuffleTips}
            delay={360}
          />
        </div>
      </div>
    </div>
  );
}

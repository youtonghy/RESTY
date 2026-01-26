import { useCallback, useEffect, useMemo, useRef, useState, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import type { AnalyticsData, AnalyticsQuery, Session } from '../types';
import { augmentSessionsWithMoreRest } from '../utils/analytics';
import './Analytics.css';

type TimeRange = 'today' | 'week' | 'month' | 'year' | 'custom';

// 热力图数据结构
type HeatmapDay = {
  date: string; // YYYY-MM-DD
  count: number; // Total breaks (completed + skipped)
  completed: number; // Completed breaks
  level: 0 | 1 | 2 | 3 | 4; // 0: empty, 1-4: intensity based on completion rate
};

// 统计卡片图标
const TotalWorkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    {...props}
  >
    <path d="M3 13C6.6 5 17.4 5 21 13" />
    <path d="M12 17C10.3431 17 9 15.6569 9 14C9 12.3431 10.3431 11 12 11C13.6569 11 15 12.3431 15 14C15 15.6569 13.6569 17 12 17Z" />
  </svg>
);

const TotalBreakIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    {...props}
  >
    <path d="M19.5 16L17.0248 12.6038" />
    <path d="M12 17.5V14" />
    <path d="M4.5 16L6.96895 12.6124" />
    <path d="M3 8C6.6 16 17.4 16 21 8" />
  </svg>
);

const BreakCountIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    {...props}
  >
    <path d="M12 11.5V16.5" />
    <path d="M12 7.51L12.01 7.49889" />
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 2 12 22Z" />
  </svg>
);

const CompletionIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    {...props}
  >
    <path d="M1.5 12.5L5.57574 16.5757C5.81005 16.8101 6.18995 16.8101 6.42426 16.5757L9 14" />
    <path d="M16 7L12 11" />
    <path d="M7 12L11.5757 16.5757C11.8101 16.8101 12.1899 16.8101 12.4243 16.5757L22 7" />
  </svg>
);

type TimelineBounds = { start: number; end: number };
type TimeScaleMark = {
  key: string;
  left: number;
  label: string;
  position: 'start' | 'middle' | 'end';
};

const DAY_MS = 24 * 60 * 60 * 1000;

const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateInputValue = (value: string): Date | null => {
  if (!value) return null;
  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
};

// 根据区间类型计算时间范围（包含结束日）
const getPresetBounds = (range: TimeRange): TimelineBounds => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  switch (range) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'week': {
      const day = start.getDay();
      const diff = (day + 6) % 7;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setFullYear(start.getFullYear(), 11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    default:
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
  }

  return { start: start.getTime(), end: end.getTime() };
};

const getCustomBounds = (startValue: string, endValue: string): TimelineBounds | null => {
  const startDate = parseDateInputValue(startValue);
  const endDate = parseDateInputValue(endValue);
  if (!startDate || !endDate) return null;
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  if (startDate.getTime() > endDate.getTime()) return null;
  return { start: startDate.getTime(), end: endDate.getTime() };
};

const createAnalyticsQuery = (bounds: TimelineBounds): AnalyticsQuery => ({
  startDate: new Date(bounds.start).toISOString(),
  endDate: new Date(bounds.end).toISOString(),
});

const getSessionSeconds = (session: Session) => {
  if (Number.isFinite(session.duration) && session.duration > 0) {
    return session.duration;
  }
  const diff = (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000;
  return Math.max(0, diff);
};

const generateTimeScale = (
  range: TimeRange,
  bounds: TimelineBounds,
  locale: string
): TimeScaleMark[] => {
  const total = bounds.end - bounds.start;
  if (total <= 0) {
    return [];
  }

  const formatter = (() => {
    switch (range) {
      case 'today':
        return new Intl.DateTimeFormat(locale, {
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
      case 'week':
        return new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          weekday: 'short',
        });
      case 'year':
        return new Intl.DateTimeFormat(locale, { month: 'short' });
      default:
        return new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
        });
    }
  })();

  const marks: TimeScaleMark[] = [];
  const addMark = (
    timestamp: number,
    position: TimeScaleMark['position'],
    labelOverride?: string
  ) => {
    const clamped = Math.min(bounds.end, Math.max(bounds.start, timestamp));
    const left = ((clamped - bounds.start) / total) * 100;
    if (marks.some((mark) => Math.abs(mark.left - left) < 0.01)) {
      return;
    }
    marks.push({
      key: `${position}-${clamped}`,
      left,
      label: labelOverride ?? formatter.format(new Date(clamped)),
      position,
    });
  };

  switch (range) {
    case 'today': {
      addMark(bounds.start, 'start');
      const sixHours = 6 * 60 * 60 * 1000;
      addMark(bounds.start + sixHours, 'middle');
      addMark(bounds.start + sixHours * 2, 'middle');
      addMark(bounds.start + sixHours * 3, 'middle');
      addMark(bounds.end, 'end', '24:00');
      break;
    }
    case 'week': {
      let current = new Date(bounds.start);
      current.setHours(0, 0, 0, 0);
      while (current.getTime() <= bounds.end) {
        const ts = current.getTime();
        const position: TimeScaleMark['position'] =
          ts === bounds.start ? 'start' : ts === bounds.end ? 'end' : 'middle';
        addMark(ts, position);
        current = new Date(ts + DAY_MS);
      }
      if (marks.every((mark) => mark.position !== 'end')) {
        addMark(bounds.end, 'end');
      }
      break;
    }
    case 'month':
    case 'year':
    case 'custom':
    default: {
      addMark(bounds.start, 'start');
      const segments = 3;
      for (let i = 1; i <= segments; i += 1) {
        addMark(bounds.start + (total * i) / (segments + 1), 'middle');
      }
      addMark(bounds.end, 'end');
      break;
    }
  }

  return marks.sort((a, b) => a.left - b.left);
};

/**
 * 数据统计页面：按日期区间加载会话数据，展示工作/休息统计与时间轴。
 */
export function Analytics() {
  const { t, i18n } = useTranslation();
  const { settings } = useAppStore();
  const [range, setRange] = useState<TimeRange>('today');
  const [customDraftStart, setCustomDraftStart] = useState(() => formatDateInputValue(new Date()));
  const [customDraftEnd, setCustomDraftEnd] = useState(() => formatDateInputValue(new Date()));
  const [customAppliedStart, setCustomAppliedStart] = useState(() => formatDateInputValue(new Date()));
  const [customAppliedEnd, setCustomAppliedEnd] = useState(() => formatDateInputValue(new Date()));
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<HeatmapDay[]>([]);
  const isZh = useMemo(() => i18n.language.startsWith('zh'), [i18n.language]);
  const moreRestEnabled = settings.moreRestEnabled;
  const isMountedRef = useRef(true);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    []
  );

  const presetBounds = useMemo<TimelineBounds>(() => getPresetBounds(range), [range]);
  const customAppliedBounds = useMemo(
    () => getCustomBounds(customAppliedStart, customAppliedEnd),
    [customAppliedStart, customAppliedEnd]
  );
  const displayBounds = useMemo<TimelineBounds>(() => {
    if (range === 'custom' && customAppliedBounds) {
      return customAppliedBounds;
    }
    return presetBounds;
  }, [customAppliedBounds, presetBounds, range]);
  const analyticsQuery = useMemo<AnalyticsQuery>(
    () => createAnalyticsQuery(displayBounds),
    [displayBounds]
  );

  const customDraftStatus = useMemo(() => {
    const startDate = parseDateInputValue(customDraftStart);
    const endDate = parseDateInputValue(customDraftEnd);
    if (!startDate || !endDate) {
      return { isValid: false, isReady: false, isOrderInvalid: false };
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);
    if (startDate.getTime() > endDate.getTime()) {
      return { isValid: false, isReady: true, isOrderInvalid: true };
    }
    return { isValid: true, isReady: true, isOrderInvalid: false };
  }, [customDraftStart, customDraftEnd]);

  const loadAnalytics = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoading(true);
    try {
      const result = await api.getAnalytics(analyticsQuery);
      if (!isMountedRef.current) return;
      setData(result);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [analyticsQuery]);

  const handleApplyCustomRange = useCallback(() => {
    if (!customDraftStatus.isValid) return;
    setCustomAppliedStart(customDraftStart);
    setCustomAppliedEnd(customDraftEnd);
  }, [customDraftStatus.isValid, customDraftStart, customDraftEnd]);

  const handleSelectRange = useCallback(
    (nextRange: TimeRange) => {
      if (nextRange === range) return;
      if (nextRange === 'custom') {
        setCustomDraftStart(customAppliedStart);
        setCustomDraftEnd(customAppliedEnd);
      }
      setRange(nextRange);
    },
    [customAppliedEnd, customAppliedStart, range]
  );

  // 生成最近 6 个月日期序列（用于热力图底板）
  const generateHeatmapDates = () => {
    const dates: string[] = [];
    const end = new Date();
    // 6 months ago
    const start = new Date();
    start.setMonth(start.getMonth() - 6);
    start.setHours(0, 0, 0, 0);

    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    return { start, end, dates };
  };

  // 加载热力图数据：按天统计休息完成度
  const loadHeatmapData = useCallback(async () => {
    const { start, end, dates } = generateHeatmapDates();
    const query: AnalyticsQuery = {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };

    try {
      const result = await api.getAnalytics(query);
      if (!isMountedRef.current) return;

      const sessions = augmentSessionsWithMoreRest(result.sessions, moreRestEnabled);
      // Process sessions into daily stats
      const dailyStats = new Map<string, { completed: number; skipped: number }>();

      sessions.forEach(session => {
        if (session.type !== 'break') return;
        const date = session.startTime.split('T')[0];
        const stats = dailyStats.get(date) || { completed: 0, skipped: 0 };

        if (session.isSkipped) {
          stats.skipped++;
        } else {
          stats.completed++;
        }
        dailyStats.set(date, stats);
      });

      const heatmap: HeatmapDay[] = dates.map(date => {
        const stats = dailyStats.get(date) || { completed: 0, skipped: 0 };
        const total = stats.completed + stats.skipped;
        let level: 0 | 1 | 2 | 3 | 4 = 0;

        if (total > 0) {
          const rate = stats.completed / total;
          if (rate === 0) level = 1; // Has breaks but 0% completion (red)
          else if (rate < 0.5) level = 2;
          else if (rate < 0.8) level = 3;
          else level = 4; // High completion (green)
        }

        return {
          date,
          count: total,
          completed: stats.completed,
          level
        };
      });

      setHeatmapData(heatmap);
    } catch (error) {
      console.error('Failed to load heatmap data:', error);
    }
  }, [moreRestEnabled]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    void loadHeatmapData();
  }, [loadHeatmapData]);

  // 实时更新：会话新增/完成/跳过时刷新数据
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;

    const subscribe = async () => {
      try {
        unlisten = await api.onSessionUpserted(() => {
          if (!active) return;
          void loadAnalytics();
          void loadHeatmapData();
        });
      } catch (error) {
        console.error('Failed to subscribe to session updates:', error);
      }
    };

    void subscribe();

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [loadAnalytics, loadHeatmapData]);

  /** 将秒数格式化为"小时+分钟"文案，不显示秒数。 */
  const formatDuration = (seconds: number): string => {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}${t('common.hours')}`);
    }
    parts.push(`${minutes}${t('common.minutes')}`);

    return parts.join(' ');
  };

  const sessionsWithMoreRest = useMemo(() => {
    if (!data) return [] as Session[];
    return augmentSessionsWithMoreRest(data.sessions, moreRestEnabled);
  }, [data, moreRestEnabled]);

  const derivedStats = useMemo(() => {
    let totalWorkSeconds = 0;
    let totalBreakSeconds = 0;
    let breakCount = 0;
    let completedBreaks = 0;
    let skippedBreaks = 0;

    for (const session of sessionsWithMoreRest) {
      const duration = getSessionSeconds(session);
      if (session.type === 'work') {
        totalWorkSeconds += duration;
      } else if (session.type === 'break') {
        totalBreakSeconds += duration;
        breakCount += 1;
        if (session.isSkipped) {
          skippedBreaks += 1;
        } else {
          completedBreaks += 1;
        }
      }
    }

    return {
      totalWorkSeconds,
      totalBreakSeconds,
      breakCount,
      completedBreaks,
      skippedBreaks,
    };
  }, [sessionsWithMoreRest]);

  const completionRate = useMemo(() => {
    if (derivedStats.breakCount <= 0) return 0;
    const rate = (derivedStats.completedBreaks / Math.max(1, derivedStats.breakCount)) * 100;
    return Math.round(rate);
  }, [derivedStats.breakCount, derivedStats.completedBreaks]);

  // 筛选出当前区间的会话（用于时间轴）
  const timelineSessions = useMemo(() => {
    if (!data) return [] as Session[];
    const { start, end } = displayBounds;
    return sessionsWithMoreRest
      .filter((s) => {
        const sStart = new Date(s.startTime).getTime();
        const sEnd = new Date(s.endTime).getTime();
        return sEnd >= start && sStart <= end;
      })
      .filter((s) => !(s.type === 'break' && s.isSkipped))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [data, displayBounds, sessionsWithMoreRest]);

  const timeScaleMarks = useMemo<TimeScaleMark[]>(
    () => generateTimeScale(range, displayBounds, i18n.language),
    [range, displayBounds, i18n.language]
  );

  const restCompletion = useMemo(() => {
    if (!data) {
      return {
        total: 0,
        gradient: 'conic-gradient(var(--color-border) 0% 100%)',
        completedPercent: 0,
        skippedPercent: 0,
      };
    }
    const total = Math.max(derivedStats.breakCount, derivedStats.completedBreaks + derivedStats.skippedBreaks);
    if (total <= 0) {
      return {
        total: 0,
        gradient: 'conic-gradient(var(--color-border) 0% 100%)',
        completedPercent: 0,
        skippedPercent: 0,
      };
    }
    const completedPercent = (derivedStats.completedBreaks / total) * 100;
    const skippedPercent = (derivedStats.skippedBreaks / total) * 100;
    const gradient = `conic-gradient(var(--color-primary) 0% ${completedPercent}%, var(--color-warning) ${completedPercent}% 100%)`;
    return {
      total,
      gradient,
      completedPercent,
      skippedPercent,
    };
  }, [data, derivedStats.breakCount, derivedStats.completedBreaks, derivedStats.skippedBreaks]);

  /**
   * 构建单条时间轴的线性渐变：
   * - 全宽 0-24h；
   * - 工作片段为蓝色（var(--color-primary)），休息片段为绿色（var(--color-success)）；
   * - 其他时间透明，底色为浅色轨道；
   */
  const buildTimelineGradient = (sessions: Session[], bounds: TimelineBounds) => {
    const base = 'var(--color-surface-hover)';
    if (!sessions || sessions.length === 0) {
      return base;
    }

    const total = bounds.end - bounds.start;
    if (total <= 0) return base;

    const stops: string[] = [];
    // 初始透明到 0%
    stops.push('transparent 0%');

    // 根据会话生成区段色带
    for (const s of sessions) {
      // 计算精准百分比（不强制最小宽度）
      const sStart = new Date(s.startTime).getTime();
      const sEnd = new Date(s.endTime).getTime();
      const clampedStart = Math.max(sStart, bounds.start);
      const clampedEnd = Math.min(sEnd, bounds.end);
      const dur = Math.max(0, clampedEnd - clampedStart);
      if (dur <= 0 || total <= 0) continue;
      const start = ((clampedStart - bounds.start) / total) * 100;
      const end = Math.min(100, start + (dur / total) * 100);
      const color = s.type === 'work' ? 'var(--color-primary)' : 'var(--color-success)';
      // 透明到 start，然后着色到 end，再恢复透明
      stops.push(`transparent ${start}%`);
      stops.push(`${color} ${start}%`);
      stops.push(`${color} ${end}%`);
      stops.push(`transparent ${end}%`);
    }

    const gradient = `linear-gradient(to right, ${stops.join(', ')})`;
    // 叠加底色，形成单条时间轴
    return `${gradient}, ${base}`;
  };

  const timelineBackground = useMemo(
    () => buildTimelineGradient(timelineSessions, displayBounds),
    [timelineSessions, displayBounds]
  );

  /**
   * 以前端为准计算当前区间的总工作/休息时长：
   * - 仅统计与区间有重叠的片段
   * - 休息忽略被跳过的片段
   */
  const computedTotals = useMemo(() => {
    if (!data) return { work: 0, rest: 0 };
    const R0 = displayBounds.start;
    const R1 = displayBounds.end;
    let work = 0;
    let rest = 0;
    for (const s of sessionsWithMoreRest) {
      const s0 = new Date(s.startTime).getTime();
      const s1 = new Date(s.endTime).getTime();
      const overlap = Math.max(0, Math.min(s1, R1) - Math.max(s0, R0));
      if (overlap <= 0) continue;
      const seconds = Math.floor(overlap / 1000);
      if (s.type === 'work') work += seconds;
      else if (s.type === 'break' && !s.isSkipped) rest += seconds;
    }
    return { work, rest };
  }, [data, displayBounds, sessionsWithMoreRest]);

  // 加载中状态
  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className="loading">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">{t('analytics.title')}</h1>

        {/* Time Range Selector */}
        <div className="range-selector">
          <button
            type="button"
            className={`range-btn ${range === 'today' ? 'active' : ''}`}
            onClick={() => handleSelectRange('today')}
          >
            {t('analytics.timeRange.today')}
          </button>
          <button
            type="button"
            className={`range-btn ${range === 'week' ? 'active' : ''}`}
            onClick={() => handleSelectRange('week')}
          >
            {t('analytics.timeRange.week')}
          </button>
          <button
            type="button"
            className={`range-btn ${range === 'month' ? 'active' : ''}`}
            onClick={() => handleSelectRange('month')}
          >
            {t('analytics.timeRange.month')}
          </button>
          <button
            type="button"
            className={`range-btn ${range === 'year' ? 'active' : ''}`}
            onClick={() => handleSelectRange('year')}
          >
            {t('analytics.timeRange.year')}
          </button>
          <button
            type="button"
            className={`range-btn ${range === 'custom' ? 'active' : ''}`}
            onClick={() => handleSelectRange('custom')}
          >
            {t('analytics.timeRange.custom')}
          </button>
        </div>

        {range === 'custom' && (
          <div className="custom-range-panel">
            <div className="custom-range-field">
              <label className="custom-range-label" htmlFor="custom-range-start">
                {t('analytics.customRange.start')}
              </label>
              <input
                id="custom-range-start"
                className="custom-range-input"
                type="date"
                value={customDraftStart}
                max={customDraftEnd || undefined}
                onChange={(event) => setCustomDraftStart(event.currentTarget.value)}
              />
            </div>
            <div className="custom-range-field">
              <label className="custom-range-label" htmlFor="custom-range-end">
                {t('analytics.customRange.end')}
              </label>
              <input
                id="custom-range-end"
                className="custom-range-input"
                type="date"
                value={customDraftEnd}
                min={customDraftStart || undefined}
                onChange={(event) => setCustomDraftEnd(event.currentTarget.value)}
              />
            </div>
            <button
              type="button"
              className="range-apply-btn"
              onClick={handleApplyCustomRange}
              disabled={!customDraftStatus.isValid}
            >
              {t('analytics.customRange.apply')}
            </button>
            {customDraftStatus.isOrderInvalid && (
              <div className="custom-range-error" role="alert">
                {t('analytics.customRange.invalidRange')}
              </div>
            )}
          </div>
        )}

        {/* Overview Stats */}
        {data && (
          <>
            <section className="stats-overview">
              <div className="stat-card analytics-card">
                <div className="stat-icon work">
                  <TotalWorkIcon aria-hidden="true" />
                </div>
                <div className="stat-value">{formatDuration(computedTotals.work)}</div>
                <div className="stat-label">{t('analytics.totalWork')}</div>
              </div>

              <div className="stat-card analytics-card">
                <div className="stat-icon break">
                  <TotalBreakIcon aria-hidden="true" />
                </div>
                <div className="stat-value">{formatDuration(computedTotals.rest)}</div>
                <div className="stat-label">{t('analytics.totalBreak')}</div>
              </div>

              <div className="stat-card analytics-card">
                <div className="stat-icon count">
                  <BreakCountIcon aria-hidden="true" />
                </div>
                <div className="stat-value">{derivedStats.breakCount}</div>
                <div className="stat-label">{t('analytics.breakCount')}</div>
              </div>

              <div className="stat-card analytics-card">
                <div className="stat-icon rate">
                  <CompletionIcon aria-hidden="true" />
                </div>
                <div className="stat-value">{completionRate}%</div>
                <div className="stat-label">{t('analytics.completionRate')}</div>
              </div>
            </section>

            {/* Session Timeline - Single Bar with Scale */}
            <section className="analytics-card timeline-section">
              <h2 className="card-header">{t('analytics.timeline')}</h2>

              <div className="horizontal-timeline-container">
                <div className="timeline-bar-wrapper">
                  <div className="timeline-scale">
                    {timeScaleMarks.map((mark) => (
                      <div
                        key={mark.key}
                        className={`time-scale-mark ${mark.position}`}
                        style={{ left: `${mark.left}%` }}
                      >
                        <div className="time-scale-label">{mark.label}</div>
                        <div className="time-scale-tick" />
                      </div>
                    ))}
                  </div>

                  {/* 单条时间轴（用渐变绘制工作/休息片段） */}
                  <div
                    className="horizontal-timeline enhanced"
                    style={{ background: timelineBackground }}
                    aria-label={t('analytics.timeline')}
                    role="img"
                  />
                </div>

                <div className="timeline-legend">
                  <div className="legend-item">
                    <div className="legend-color work"></div>
                    <span>{t('reminder.title.work')}</span>
                  </div>
                  <div className="legend-item">
                    <div className="legend-color break"></div>
                    <span>{t('reminder.title.break')}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Overview + Heatmap side-by-side */}
            <div className="details-row">
              <section className="analytics-card stats-details">
                <h2 className="card-header">{t('analytics.overview')}</h2>
                <div className="stats-grid">
                  <div className="stat-item stat-item-pie">
                    <div className="stat-item-pie-header">
                      <span className="stat-item-label">
                        {t('analytics.completionRate')}
                      </span>
                      <span className="stat-item-total">
                        {completionRate}%
                      </span>
                    </div>
                    <div className="completion-pie">
                      <div
                        className={`completion-pie-chart${restCompletion.total === 0 ? ' is-empty' : ''}`}
                        style={{ background: restCompletion.gradient }}
                        role="img"
                        aria-label={t('analytics.completionRate')}
                      >
                        <span className="completion-pie-value">{completionRate}%</span>
                      </div>
                      <ul className="completion-pie-legend">
                        <li className="completion-pie-legend-item">
                          <span className="completion-pie-dot completed" aria-hidden="true" />
                          <span>{t('analytics.completionLegend.completed', { defaultValue: isZh ? '已休息' : 'Completed' })}</span>
                          <span className="completion-pie-count">{derivedStats.completedBreaks}</span>
                        </li>
                        <li className="completion-pie-legend-item">
                          <span className="completion-pie-dot skipped" aria-hidden="true" />
                          <span>{t('analytics.completionLegend.skipped', { defaultValue: isZh ? '跳过' : 'Skipped' })}</span>
                          <span className="completion-pie-count">{derivedStats.skippedBreaks}</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                <div className="stat-item">
                  <span className="stat-item-label">{t('analytics.skippedBreaks')}</span>
                  <div className="stat-item-value text-warning">
                      {derivedStats.skippedBreaks}
                  </div>
                </div>
                </div>
              </section>

              {/* Heatmap */}
              <section className="analytics-card stats-details heatmap-section">
                <h2 className="card-header">{isZh ? '休息完成度' : 'Rest Completion'}</h2>
                <div className="heatmap-container">
                  <div className="heatmap-grid">
                    {heatmapData.map((day) => (
                      <div
                        key={day.date}
                        className={`heatmap-cell level-${day.level}`}
                        title={`${day.date}: ${Math.round((day.completed / Math.max(1, day.count)) * 100)}% (${day.completed}/${day.count})`}
                      />
                    ))}
                  </div>
                  <div className="heatmap-legend">
                    <span>{isZh ? '低' : 'Less'}</span>
                    <div className="heatmap-cell level-0" />
                    <div className="heatmap-cell level-1" />
                    <div className="heatmap-cell level-2" />
                    <div className="heatmap-cell level-3" />
                    <div className="heatmap-cell level-4" />
                    <span>{isZh ? '高' : 'More'}</span>
                  </div>
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

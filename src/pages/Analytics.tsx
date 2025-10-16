import { useEffect, useMemo, useRef, useState, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../utils/api';
import type { AnalyticsData, AnalyticsQuery, Session } from '../types';
import './Analytics.css';

type TimeRange = 'today' | 'week' | 'month' | 'custom';
type FragmentCell = {
  type: 'work' | 'break';
  startTime: string;
  duration: number;
};

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
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
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

/**
 * 数据统计页面：按日期区间加载会话数据，展示工作/休息统计与时间轴。
 */
export function Analytics() {
  const { t, i18n } = useTranslation();
  const [range, setRange] = useState<TimeRange>('today');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [weeklyWorkFragments, setWeeklyWorkFragments] = useState<number>(0);
  const [weeklyRestFragments, setWeeklyRestFragments] = useState<number>(0);
  const [weeklyFragmentCells, setWeeklyFragmentCells] = useState<FragmentCell[]>([]);
  const isZh = useMemo(() => i18n.language.startsWith('zh'), [i18n.language]);
  const fragmentScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [range]);

  // Load weekly fragment counts once (or when day changes)
  useEffect(() => {
    // fire and forget; independent of current range selection
    (async () => {
      try {
        const weekQuery = getQueryForRange('week');
        const weekData = await api.getAnalytics(weekQuery);
        setWeeklyWorkFragments(countWorkFragments(weekData.sessions));
        setWeeklyRestFragments(countRestFragments(weekData.sessions));
        setWeeklyFragmentCells(buildFragmentCells(weekData.sessions));
      } catch (e) {
        console.error('Failed to load weekly fragments:', e);
        setWeeklyFragmentCells([]);
      }
    })();
  }, []);

  useEffect(() => {
    const node = fragmentScrollRef.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth;
  }, [weeklyFragmentCells.length]);

  // Real-time: refresh analytics when sessions are upserted (start/finish/skip)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await api.onSessionUpserted(async () => {
        // Refresh current range data
        await loadAnalytics();
        // Also refresh weekly fragments in background
        try {
          const weekData = await api.getAnalytics(getQueryForRange('week'));
          setWeeklyWorkFragments(countWorkFragments(weekData.sessions));
          setWeeklyRestFragments(countRestFragments(weekData.sessions));
          setWeeklyFragmentCells(buildFragmentCells(weekData.sessions));
        } catch (e) {
          console.warn('Failed to refresh fragments after session-upserted:', e);
        }
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  /** 根据当前选择的时间范围获取统计数据。 */
  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const query = getQueryForRange(range);
      const result = await api.getAnalytics(query);
      setData(result);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  /** 将时间范围转换为后端需要的查询参数。 */
  const getQueryForRange = (range: TimeRange): AnalyticsQuery => {
    const bounds = getDisplayBounds(range);
    return {
      startDate: new Date(bounds.start).toISOString(),
      endDate: new Date(bounds.end).toISOString(),
    };
  };

  const getDisplayBounds = (range: TimeRange) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    switch (range) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        start.setHours(0, 0, 0, 0);
        break;
      default:
        start.setHours(0, 0, 0, 0);
        break;
    }

    return { start: start.getTime(), end: end.getTime() };
  };

  /** 仅计算工作片段数量 */
  const countWorkFragments = (sessions: Session[]) =>
    sessions.reduce((acc, s) => (s.type === 'work' ? acc + 1 : acc), 0);

  /** 仅计算休息片段数量（排除跳过的休息） */
  const countRestFragments = (sessions: Session[]) =>
    sessions.reduce((acc, s) => (s.type === 'break' && !s.isSkipped ? acc + 1 : acc), 0);

  const buildFragmentCells = (sessions: Session[]): FragmentCell[] => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    return sorted.reduce<FragmentCell[]>((acc, session) => {
      const duration =
        typeof session.duration === 'number'
          ? session.duration
          : Math.max(
              0,
              Math.floor(
                (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) /
                  1000
              )
            );
      if (session.type === 'work') {
        acc.push({ type: 'work', startTime: session.startTime, duration });
      } else if (session.type === 'break' && !session.isSkipped) {
        acc.push({ type: 'break', startTime: session.startTime, duration });
      }
      return acc;
    }, []);
  };

  /** 将秒数格式化为“小时+分钟”文案。 */
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}${t('common.hours')} ${minutes}${t('common.minutes')}`;
    }
    return `${minutes}${t('common.minutes')}`;
  };

  /** 计算休息完成率（已完成/总次数）。 */
  const getCompletionRate = (): number => {
    if (!data || data.breakCount === 0) return 0;
    return Math.round((data.completedBreaks / data.breakCount) * 100);
  };

  type TimelineBounds = { start: number; end: number };
  type TimeScaleMark = {
    key: string;
    left: number;
    label: string;
    position: 'start' | 'middle' | 'end';
  };

  const displayBounds = useMemo<TimelineBounds>(() => getDisplayBounds(range), [range]);

  const timelineSessions = useMemo(() => {
    if (!data) return [] as Session[];
    const { start, end } = displayBounds;
    return data.sessions
      .filter((s) => {
        const sStart = new Date(s.startTime).getTime();
        const sEnd = new Date(s.endTime).getTime();
        return sEnd >= start && sStart <= end;
      })
      .filter((s) => !(s.type === 'break' && s.isSkipped))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [data, displayBounds]);

  const generateTimeScale = (
    selectedRange: TimeRange,
    bounds: TimelineBounds,
    language: string
  ): TimeScaleMark[] => {
    const marks: TimeScaleMark[] = [];
    const total = bounds.end - bounds.start;
    if (total <= 0) return marks;

    const clampToBounds = (timestamp: number) =>
      Math.min(bounds.end, Math.max(bounds.start, timestamp));
    const computeLeft = (timestamp: number) =>
      ((clampToBounds(timestamp) - bounds.start) / total) * 100;

    const DAY_MS = 24 * 60 * 60 * 1000;
    const dateFormatter = new Intl.DateTimeFormat(language, {
      month: 'numeric',
      day: 'numeric',
    });

    if (selectedRange === 'today' || selectedRange === 'custom') {
      const HOURS_STEP = 2;
      const HOURS_TOTAL = 24;
      for (let h = 0; h <= HOURS_TOTAL; h += HOURS_STEP) {
        const timestamp = bounds.start + h * 60 * 60 * 1000;
        marks.push({
          key: `hour-${h}`,
          left: computeLeft(timestamp),
          label: `${String(h).padStart(2, '0')}:00`,
          position: h === 0 ? 'start' : h === HOURS_TOTAL ? 'end' : 'middle',
        });
      }
      return marks;
    }

    if (selectedRange === 'week') {
      const totalDays = Math.max(1, Math.ceil(total / DAY_MS));
      for (let d = 0; d <= totalDays; d++) {
        const timestamp = bounds.start + d * DAY_MS;
        marks.push({
          key: `day-${d}`,
          left: computeLeft(timestamp),
          label: dateFormatter.format(new Date(clampToBounds(timestamp))),
          position: d === 0 ? 'start' : d === totalDays ? 'end' : 'middle',
        });
      }
      return marks;
    }

    if (selectedRange === 'month') {
      const totalDays = Math.max(1, Math.ceil(total / DAY_MS));
      const approxSegments = 6;
      const interval = Math.max(1, Math.round(totalDays / approxSegments));

      marks.push({
        key: 'day-0',
        left: computeLeft(bounds.start),
        label: dateFormatter.format(new Date(bounds.start)),
        position: 'start',
      });

      for (let d = interval; d < totalDays; d += interval) {
        const timestamp = bounds.start + d * DAY_MS;
        marks.push({
          key: `day-${d}`,
          left: computeLeft(timestamp),
          label: dateFormatter.format(new Date(clampToBounds(timestamp))),
          position: 'middle',
        });
      }

      marks.push({
        key: `day-${totalDays}`,
        left: computeLeft(bounds.end),
        label: dateFormatter.format(new Date(bounds.end)),
        position: 'end',
      });

      return marks;
    }

    return marks;
  };

  const timeScaleMarks = useMemo(
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
    const total = Math.max(data.breakCount, data.completedBreaks + data.skippedBreaks);
    if (total <= 0) {
      return {
        total: 0,
        gradient: 'conic-gradient(var(--color-border) 0% 100%)',
        completedPercent: 0,
        skippedPercent: 0,
      };
    }
    const completedPercent = (data.completedBreaks / total) * 100;
    const skippedPercent = (data.skippedBreaks / total) * 100;
    const gradient = `conic-gradient(var(--color-primary) 0% ${completedPercent}%, var(--color-warning) ${completedPercent}% 100%)`;
    return {
      total,
      gradient,
      completedPercent,
      skippedPercent,
    };
  }, [data]);

  const fragmentTimeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [i18n.language]
  );

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
    const { startDate, endDate } = getQueryForRange(range);
    const R0 = new Date(startDate).getTime();
    const R1 = new Date(endDate).getTime();
    let work = 0;
    let rest = 0;
    for (const s of data.sessions) {
      const s0 = new Date(s.startTime).getTime();
      const s1 = new Date(s.endTime).getTime();
      const overlap = Math.max(0, Math.min(s1, R1) - Math.max(s0, R0));
      if (overlap <= 0) continue;
      const seconds = Math.floor(overlap / 1000);
      if (s.type === 'work') work += seconds;
      else if (s.type === 'break' && !s.isSkipped) rest += seconds;
    }
    return { work, rest };
  }, [data, range]);

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
            className={`range-btn ${range === 'today' ? 'active' : ''}`}
            onClick={() => setRange('today')}
          >
            {t('analytics.timeRange.today')}
          </button>
          <button
            className={`range-btn ${range === 'week' ? 'active' : ''}`}
            onClick={() => setRange('week')}
          >
            {t('analytics.timeRange.week')}
          </button>
          <button
            className={`range-btn ${range === 'month' ? 'active' : ''}`}
            onClick={() => setRange('month')}
          >
            {t('analytics.timeRange.month')}
          </button>
        </div>

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
                <div className="stat-value">{data.breakCount}</div>
                <div className="stat-label">{t('analytics.breakCount')}</div>
              </div>

              <div className="stat-card analytics-card">
                <div className="stat-icon rate">
                  <CompletionIcon aria-hidden="true" />
                </div>
                <div className="stat-value">{getCompletionRate()}%</div>
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

            {/* Overview + Fragments side-by-side */}
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
                          {data.completedBreaks} / {data.breakCount}
                        </span>
                      </div>
                      <div className="completion-pie">
                        <div
                          className={`completion-pie-chart${restCompletion.total === 0 ? ' is-empty' : ''}`}
                          style={{ background: restCompletion.gradient }}
                          role="img"
                          aria-label={t('analytics.completionRate')}
                        >
                          <span className="completion-pie-value">{getCompletionRate()}%</span>
                        </div>
                        <ul className="completion-pie-legend">
                          <li className="completion-pie-legend-item">
                            <span className="completion-pie-dot completed" aria-hidden="true" />
                            <span>{t('analytics.completionLegend.completed', { defaultValue: isZh ? '已休息' : 'Completed' })}</span>
                            <span className="completion-pie-count">{data.completedBreaks}</span>
                          </li>
                          <li className="completion-pie-legend-item">
                            <span className="completion-pie-dot skipped" aria-hidden="true" />
                            <span>{t('analytics.completionLegend.skipped', { defaultValue: isZh ? '跳过' : 'Skipped' })}</span>
                            <span className="completion-pie-count">{data.skippedBreaks}</span>
                          </li>
                        </ul>
                      </div>
                    </div>

                    <div className="stat-item">
                      <span className="stat-item-label">{t('analytics.skippedBreaks')}</span>
                      <div className="stat-item-value text-warning">
                        {data.skippedBreaks}
                      </div>
                    </div>
                </div>
              </section>

              {/* Weekly fragment totals */}
              <section className="analytics-card stats-details">
                <h2 className="card-header">{t('analytics.fragments')}</h2>
                <div
                  className="fragment-visual"
                  role="group"
                  aria-label={t('analytics.fragments', {
                    defaultValue: isZh ? '片段统计' : 'Fragment statistics',
                  })}
                >
                  <div className="fragment-heatmap">
                    {weeklyFragmentCells.length > 0 ? (
                      <div className="fragment-grid-wrapper" ref={fragmentScrollRef}>
                        <div
                          className="fragment-grid"
                          role="list"
                          aria-label={t('analytics.fragmentsList', {
                            defaultValue: isZh ? '片段列表' : 'Fragment list',
                          })}
                        >
                          {weeklyFragmentCells.map((fragment, index) => {
                            const typeLabel = isZh
                              ? fragment.type === 'work'
                                ? '工作片段'
                                : '休息片段'
                              : fragment.type === 'work'
                              ? 'Work fragment'
                              : 'Break fragment';
                            const timeLabel = fragmentTimeFormatter.format(new Date(fragment.startTime));
                            const durationLabel = formatDuration(fragment.duration);
                            const label = `${typeLabel} · ${timeLabel} · ${durationLabel}`;
                            return (
                              <span
                                key={`${fragment.startTime}-${index}`}
                                className={`fragment-cell fragment-${fragment.type}`}
                                title={label}
                                aria-label={label}
                                role="listitem"
                              />
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="fragment-grid fragment-grid-empty">
                        {t('analytics.fragmentsEmpty', {
                          defaultValue: isZh ? '本周暂无片段' : 'No fragments this week',
                        })}
                      </div>
                    )}

                    <div className="fragment-legend">
                      <div className="fragment-legend-item">
                        <span className="fragment-legend-dot work" aria-hidden="true" />
                        <span className="fragment-legend-text">
                          {t('analytics.fragmentsLegend.work', {
                            defaultValue: isZh ? '工作片段' : 'Work fragment',
                          })}
                        </span>
                        <span className="fragment-legend-count">{weeklyWorkFragments}</span>
                      </div>
                      <div className="fragment-legend-item">
                        <span className="fragment-legend-dot break" aria-hidden="true" />
                        <span className="fragment-legend-text">
                          {t('analytics.fragmentsLegend.break', {
                            defaultValue: isZh ? '休息片段' : 'Break fragment',
                          })}
                        </span>
                        <span className="fragment-legend-count">{weeklyRestFragments}</span>
                      </div>
                    </div>
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

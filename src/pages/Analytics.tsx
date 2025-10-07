import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../utils/api';
import type { AnalyticsData, AnalyticsQuery, Session } from '../types';
import './Analytics.css';

type TimeRange = 'today' | 'week' | 'month' | 'custom';

/**
 * 数据统计页面：按日期区间加载会话数据，展示工作/休息统计与时间轴。
 */
export function Analytics() {
  const { t } = useTranslation();
  const [range, setRange] = useState<TimeRange>('today');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [weeklyFragments, setWeeklyFragments] = useState<number>(0);
  const [monthlyFragments, setMonthlyFragments] = useState<number>(0);

  useEffect(() => {
    loadAnalytics();
  }, [range]);

  // Load week/month fragment counts once (or when day changes)
  useEffect(() => {
    // fire and forget; independent of current range selection
    (async () => {
      try {
        const weekQuery = getQueryForRange('week');
        const monthQuery = getQueryForRange('month');
        const [weekData, monthData] = await Promise.all([
          api.getAnalytics(weekQuery),
          api.getAnalytics(monthQuery)
        ]);
        setWeeklyFragments(countFragments(weekData.sessions));
        setMonthlyFragments(countFragments(monthData.sessions));
      } catch (e) {
        console.error('Failed to load week/month fragments:', e);
      }
    })();
  }, []);

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
    const now = new Date();
    const endDate = now.toISOString();
    let startDate: string;

    switch (range) {
      case 'today':
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        startDate = today.toISOString();
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        startDate = weekAgo.toISOString();
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        startDate = monthAgo.toISOString();
        break;
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }

    return { startDate, endDate };
  };

  /** 计算“片段”数量：工作片段 + 非跳过的休息片段 */
  const countFragments = (sessions: Session[]) => {
    return sessions.reduce((acc, s) => {
      if (s.type === 'work') return acc + 1;
      if (s.type === 'break' && !s.isSkipped) return acc + 1;
      return acc;
    }, 0);
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

  /** 返回今天 00:00:00 和 23:59:59 的毫秒时间戳 */
  const getTodayBounds = () => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  };

  /** 生成 0-24 小时的横向时间刻度（每 2 小时一刻度） */
  const generateTimeScale = () => {
    const marks = [] as JSX.Element[];
    for (let h = 0; h <= 24; h += 2) {
      const left = (h / 24) * 100;
      const label = `${String(h).padStart(2, '0')}:00`;
      marks.push(
        <div key={h} className="time-scale-mark" style={{ left: `${left}%` }}>
          <div className="time-scale-line"></div>
          <div className="time-scale-label">{label}</div>
        </div>
      );
    }
    return marks;
  };

  /** 计算某会话在“今天时间轴”上的 left% */
  const calculateTimelinePosition = (startTime: string) => {
    const { start, end } = getTodayBounds();
    const total = end - start;
    const s = Math.max(new Date(startTime).getTime(), start);
    return ((s - start) / total) * 100;
  };

  /** 计算会话宽度（相对全天 24h），并做边界裁剪 */
  const calculateBlockWidth = (session: Session) => {
    const { start, end } = getTodayBounds();
    const total = end - start;
    const sessionStart = new Date(session.startTime).getTime();
    const sessionEnd = new Date(session.endTime).getTime();
    const clampedStart = Math.max(sessionStart, start);
    const clampedEnd = Math.min(sessionEnd, end);
    const dur = Math.max(0, clampedEnd - clampedStart);
    return Math.max((dur / total) * 100, 1.5);
  };
  // 仅用于时间轴的“今日片段”，过滤掉跳过的休息
  const daySessions = useMemo(() => {
    const sessions = data?.sessions ?? [];
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    return sessions
      .filter((s) => {
        const ds = new Date(s.startTime);
        return ds.getFullYear() === y && ds.getMonth() === m && ds.getDate() === d;
      })
      .filter((s) => !(s.type === 'break' && s.isSkipped))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [data]);

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
              <div className="stat-card">
                <div className="stat-icon work">💼</div>
                <div className="stat-value">{formatDuration(data.totalWorkSeconds)}</div>
                <div className="stat-label">{t('analytics.totalWork')}</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon break">☕</div>
                <div className="stat-value">{formatDuration(data.totalBreakSeconds)}</div>
                <div className="stat-label">{t('analytics.totalBreak')}</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon count">📊</div>
                <div className="stat-value">{data.breakCount}</div>
                <div className="stat-label">{t('analytics.breakCount')}</div>
              </div>

              <div className="stat-card">
                <div className="stat-icon rate">✅</div>
                <div className="stat-value">{getCompletionRate()}%</div>
                <div className="stat-label">{t('analytics.completionRate')}</div>
              </div>
            </section>

            {/* Session Timeline - Horizontal (Today only) */}
            <section className="card timeline-section">
              <h2 className="card-header">{t('analytics.timeline')}</h2>

              {daySessions.length === 0 ? (
                <div className="no-data">{t('analytics.noData')}</div>
              ) : (
                <div className="horizontal-timeline-container">
                  <div className="timeline-header">
                    <div className="timeline-time-scale">
                      {generateTimeScale()}
                    </div>
                  </div>
                  <div className="horizontal-timeline enhanced">
                    {daySessions.map((session) => (
                      <div
                        key={session.id}
                        className={`timeline-block ${session.type}`}
                        style={{
                          left: `${calculateTimelinePosition(session.startTime)}%`,
                          width: `${calculateBlockWidth(session)}%`,
                        }}
                        title={`${session.type === 'work' ? t('reminder.title.work') : t('reminder.title.break')} - ${formatDuration(session.duration)}`}
                      >
                        <div className="timeline-block-content">
                          <div className="timeline-block-type">
                            {session.type === 'work' ? '💼' : '☕'}
                          </div>
                          <div className="timeline-block-time">
                            {new Date(session.startTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="timeline-block-duration">
                            {formatDuration(session.duration)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="timeline-legend enhanced">
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
              )}
            </section>

            {/* Additional Stats */}
            <section className="card stats-details">
              <h2 className="card-header">{t('analytics.overview')}</h2>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-item-label">
                    {t('analytics.completionRate')}
                  </span>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${getCompletionRate()}%` }}
                    ></div>
                  </div>
                  <span className="stat-item-value">
                    {data.completedBreaks} / {data.breakCount}
                  </span>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">{t('analytics.skippedBreaks')}</span>
                  <div className="stat-item-value text-warning">
                    {data.skippedBreaks}
                  </div>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">{t('analytics.averageSession')}</span>
                  <div className="stat-item-value">
                    {data.sessions.length > 0
                      ? formatDuration(
                          Math.round(
                            data.sessions.reduce((sum: number, s: Session) => sum + s.duration, 0) /
                              data.sessions.length
                          )
                        )
                      : `0${t('common.minutes')}`}
                  </div>
                </div>
              </div>
            </section>

            {/* Week/Month fragment totals */}
            <section className="card stats-details">
              <h2 className="card-header">{t('analytics.fragments')}</h2>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-item-label">{t('analytics.totalFragmentsWeek')}</span>
                  <div className="stat-item-value">{weeklyFragments}</div>
                </div>
                <div className="stat-item">
                  <span className="stat-item-label">{t('analytics.totalFragmentsMonth')}</span>
                  <div className="stat-item-value">{monthlyFragments}</div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

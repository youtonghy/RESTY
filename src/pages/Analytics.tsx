import { useEffect, useState } from 'react';
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

  useEffect(() => {
    loadAnalytics();
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

  /** 获取时间范围内的开始和结束时间 */
  const getTimeRange = () => {
    if (!data || data.sessions.length === 0) return { start: 0, end: 0 };

    const timestamps = data.sessions.flatMap(s => [
      new Date(s.startTime).getTime(),
      new Date(s.endTime).getTime()
    ]);

    return {
      start: Math.min(...timestamps),
      end: Math.max(...timestamps)
    };
  };

  /** 生成时间刻度 */
  const generateTimeScale = (sessions: Session[]) => {
    if (sessions.length === 0) return [];

    const { start, end } = getTimeRange();
    const totalDuration = end - start;
    const hours = Math.ceil(totalDuration / (1000 * 60 * 60));

    const scale = [];
    for (let i = 0; i <= hours; i++) {
      const time = new Date(start + i * 1000 * 60 * 60);
      scale.push(
        <div key={i} className="time-scale-mark" style={{ left: `${(i / hours) * 100}%` }}>
          <div className="time-scale-line"></div>
          <div className="time-scale-label">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      );
    }

    return scale;
  };

  /** 计算时间轴上的位置 */
  const calculateTimelinePosition = (sessions: Session[], startTime: string, index: number) => {
    if (sessions.length === 0) return 0;

    const { start, end } = getTimeRange();
    const totalDuration = end - start;
    const sessionStart = new Date(startTime).getTime();

    return ((sessionStart - start) / totalDuration) * 100;
  };

  /** 计算时间块的宽度 */
  const calculateBlockWidth = (sessions: Session[], session: Session, index: number) => {
    if (sessions.length === 0) return 0;

    const { start, end } = getTimeRange();
    const totalDuration = end - start;
    const sessionStart = new Date(session.startTime).getTime();
    const sessionEnd = new Date(session.endTime).getTime();
    const sessionDuration = sessionEnd - sessionStart;

    // 最小宽度为1.5%，确保即使很短的会话也能看到
    return Math.max((sessionDuration / totalDuration) * 100, 1.5);
  };

  /** 计算会话间隙并填充 */
  const calculateGaps = (sessions: Session[]) => {
    if (sessions.length === 0) return [];

    const { start, end } = getTimeRange();
    const totalDuration = end - start;
    const gaps = [];

    // 按开始时间排序
    const sortedSessions = [...sessions].sort((a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    // 检查开始间隙
    const firstSessionStart = new Date(sortedSessions[0].startTime).getTime();
    if (firstSessionStart > start) {
      gaps.push({
        start: 0,
        width: ((firstSessionStart - start) / totalDuration) * 100,
        type: 'idle'
      });
    }

    // 检查会话之间的间隙
    for (let i = 0; i < sortedSessions.length - 1; i++) {
      const currentEnd = new Date(sortedSessions[i].endTime).getTime();
      const nextStart = new Date(sortedSessions[i + 1].startTime).getTime();

      if (nextStart > currentEnd) {
        const gapStart = ((currentEnd - start) / totalDuration) * 100;
        const gapWidth = ((nextStart - currentEnd) / totalDuration) * 100;
        gaps.push({
          start: gapStart,
          width: gapWidth,
          type: 'idle'
        });
      }
    }

    // 检查结束间隙
    const lastSessionEnd = new Date(sortedSessions[sortedSessions.length - 1].endTime).getTime();
    if (lastSessionEnd < end) {
      const gapStart = ((lastSessionEnd - start) / totalDuration) * 100;
      const gapWidth = ((end - lastSessionEnd) / totalDuration) * 100;
      gaps.push({
        start: gapStart,
        width: gapWidth,
        type: 'idle'
      });
    }

    return gaps;
  };

  if (loading) {
    return (
      <div className="page">
        <div className="container">
          <div className="loading">Loading...</div>
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

            {/* Session Timeline - Horizontal */}
            <section className="card timeline-section">
              <h2 className="card-header">{t('analytics.timeline')}</h2>

              {data.sessions.length === 0 ? (
                <div className="no-data">{t('analytics.noData')}</div>
              ) : (
                <div className="horizontal-timeline-container">
                  <div className="timeline-header">
                    <div className="timeline-time-scale">
                      {generateTimeScale(data.sessions)}
                    </div>
                  </div>
                  <div className="horizontal-timeline enhanced">
                    {/* 渲染间隙（空闲时间） */}
                    {calculateGaps(data.sessions).map((gap, index) => (
                      <div
                        key={`gap-${index}`}
                        className="timeline-block idle"
                        style={{
                          left: `${gap.start}%`,
                          width: `${gap.width}%`,
                        }}
                        title="空闲时间"
                      >
                        <div className="timeline-block-content">
                          <div className="timeline-block-type">⏸️</div>
                        </div>
                      </div>
                    ))}
                    {/* 渲染工作/休息会话 */}
                    {data.sessions
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map((session: Session, index: number) => (
                      <div
                        key={session.id}
                        className={`timeline-block ${session.type} ${session.isSkipped ? 'skipped' : ''}`}
                        style={{
                          left: `${calculateTimelinePosition(data.sessions, session.startTime, index)}%`,
                          width: `${calculateBlockWidth(data.sessions, session, index)}%`,
                        }}
                        title={`${session.type === 'work' ? t('reminder.title.work') : t('reminder.title.break')} - ${formatDuration(session.duration)}${session.isSkipped ? ' (已跳过)' : ''}`}
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
                          {session.isSkipped && (
                            <div className="timeline-block-skipped">
                              {t('reminder.actions.skip')}
                            </div>
                          )}
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
                    <div className="legend-item">
                      <div className="legend-color idle"></div>
                      <span>空闲时间</span>
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
                  <span className="stat-item-label">Skipped Breaks</span>
                  <div className="stat-item-value text-warning">
                    {data.skippedBreaks}
                  </div>
                </div>

                <div className="stat-item">
                  <span className="stat-item-label">Average Session</span>
                  <div className="stat-item-value">
                    {data.sessions.length > 0
                      ? formatDuration(
                          Math.round(
                            data.sessions.reduce((sum: number, s: Session) => sum + s.duration, 0) /
                              data.sessions.length
                          )
                        )
                      : '0m'}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

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

            {/* Session Timeline */}
            <section className="card timeline-section">
              <h2 className="card-header">{t('analytics.timeline')}</h2>

              {data.sessions.length === 0 ? (
                <div className="no-data">{t('analytics.noData')}</div>
              ) : (
                <div className="timeline">
                  {data.sessions.map((session: Session) => (
                    <div
                      key={session.id}
                      className={`timeline-item ${session.type}`}
                    >
                      <div className="timeline-marker"></div>
                      <div className="timeline-content">
                        <div className="timeline-time">
                          {new Date(session.startTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="timeline-type">
                          {session.type === 'work'
                            ? t('reminder.title.work')
                            : t('reminder.title.break')}
                        </div>
                        <div className="timeline-duration">
                          {formatDuration(session.duration)}
                        </div>
                        {session.isSkipped && (
                          <span className="timeline-badge">
                            {t('reminder.actions.skip')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
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

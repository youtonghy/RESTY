import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import type { AnalyticsQuery, Session } from '../types';
import { augmentSessionsWithMoreRest } from '../utils/analytics';
import './DailyReport.css';

type ReportLevel = 'excellent' | 'good' | 'fair' | 'poor';

interface DailyStats {
  date: string;
  workDuration: number; // seconds
  restDuration: number; // seconds
  totalBreaks: number;
  completedBreaks: number;
  completionRate: number; // 0-100
  maxContinuousWork: number; // seconds
}

interface ReportCardData extends DailyStats {
  level: ReportLevel;
  scoreDetails: ScoreDetails;
}

interface ScoreDetails {
  score: number;
  continuousSteps: number;
  continuousPenalty: number;
  screenBasePenalty: number;
  screenExtraSteps: number;
  screenExtraPenalty: number;
  rawPenalty: number;
  appliedPenalty: number;
  capped: boolean;
}

// 日报评分阈值与扣分配置
const MIN_EFFECTIVE_BREAK_SEC = 180;
const SCORE_MAX = 100;
const SCORE_MIN = 20;
const CONTINUOUS_WORK_STEP_SEC = 40 * 60;
const CONTINUOUS_WORK_PENALTY = 5;
const SCREEN_BASE_SEC = 4 * 60 * 60;
const SCREEN_BASE_PENALTY = 5;
const SCREEN_STEP_SEC = 2 * 60 * 60;
const SCREEN_STEP_PENALTY = 10;

const PAGE_SIZE = 15;
const WINDOW_DAYS = 15;

const getSessionSeconds = (session: Session) => {
  if (Number.isFinite(session.duration) && session.duration > 0) {
    return session.duration;
  }
  const diff = (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000;
  return Math.max(0, diff);
};

const getBreakResetThreshold = (session: Session) =>
  Math.max(MIN_EFFECTIVE_BREAK_SEC, session.plannedDuration * 0.5);

// 计算最长连续专注时长
const calculateMaxContinuousWork = (sessions: Session[]) => {
  const ordered = [...sessions].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  let currentWork = 0;
  let maxWork = 0;
  let previousEnd: number | null = null;

  ordered.forEach(session => {
    const duration = getSessionSeconds(session);
    const startMs = new Date(session.startTime).getTime();
    const endMs = new Date(session.endTime).getTime();

    if (previousEnd !== null) {
      const gapSec = (startMs - previousEnd) / 1000;
      if (gapSec >= MIN_EFFECTIVE_BREAK_SEC) {
        currentWork = 0;
      }
    }

    if (session.type === 'break') {
      const resetThreshold = getBreakResetThreshold(session);
      if (duration >= resetThreshold) {
        currentWork = 0;
      }
    } else {
      currentWork += duration;
      if (currentWork > maxWork) {
        maxWork = currentWork;
      }
    }

    previousEnd = endMs;
  });

  return maxWork;
};

const calculateDailyScoreDetails = (stats: DailyStats): ScoreDetails => {
  const continuousSteps = Math.floor(stats.maxContinuousWork / CONTINUOUS_WORK_STEP_SEC);
  const continuousPenalty = continuousSteps * CONTINUOUS_WORK_PENALTY;

  let screenBasePenalty = 0;
  let screenExtraSteps = 0;
  let screenExtraPenalty = 0;

  if (stats.workDuration > SCREEN_BASE_SEC) {
    screenBasePenalty = SCREEN_BASE_PENALTY;
    const extraSec = stats.workDuration - SCREEN_BASE_SEC;
    screenExtraSteps = Math.floor(extraSec / SCREEN_STEP_SEC);
    screenExtraPenalty = screenExtraSteps * SCREEN_STEP_PENALTY;
  }

  const rawPenalty = continuousPenalty + screenBasePenalty + screenExtraPenalty;
  const maxPenalty = SCORE_MAX - SCORE_MIN;
  const appliedPenalty = Math.min(maxPenalty, rawPenalty);
  const score = SCORE_MAX - appliedPenalty;

  return {
    score,
    continuousSteps,
    continuousPenalty,
    screenBasePenalty,
    screenExtraSteps,
    screenExtraPenalty,
    rawPenalty,
    appliedPenalty,
    capped: rawPenalty > maxPenalty,
  };
};

const pad2 = (value: number) => String(value).padStart(2, '0');

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toLocalMiddayISOString = (date: Date) => {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
};

const endOfLocalDay = (base: Date) => {
  const d = new Date(base);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfLocalDay = (base: Date) => {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
};

const previousLocalDayEnd = (base: Date) => {
  const d = new Date(base);
  d.setDate(d.getDate() - 1);
  d.setHours(23, 59, 59, 999);
  return d;
};

const getReportLevel = (score: number): ReportLevel => {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
};

const groupSessionsByLocalDay = (sessions: Session[]) => {
  const map = new Map<string, Session[]>();
  sessions.forEach((session) => {
    const key = toLocalDateKey(new Date(session.startTime));
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(session);
    } else {
      map.set(key, [session]);
    }
  });
  return map;
};

const buildDailyReport = (day: Date, daySessions: Session[]): ReportCardData | null => {
  let workSec = 0;
  let restSec = 0;
  let totalBreaks = 0;
  let completedBreaks = 0;

  daySessions.forEach((s) => {
    const dur = getSessionSeconds(s);
    if (s.type === 'work') {
      workSec += dur;
      return;
    }
    if (s.type !== 'break') return;
    totalBreaks += 1;
    restSec += dur;
    if (!s.isSkipped) {
      completedBreaks += 1;
    }
  });

  const maxContinuousWork = calculateMaxContinuousWork(daySessions);

  // If very little activity, skip
  if (workSec < 60 && totalBreaks === 0) {
    return null;
  }

  const completionRate =
    totalBreaks > 0 ? Math.round((completedBreaks / Math.max(1, totalBreaks)) * 100) : 0;

  const stats: DailyStats = {
    date: toLocalMiddayISOString(day),
    workDuration: workSec,
    restDuration: restSec,
    totalBreaks,
    completedBreaks,
    completionRate,
    maxContinuousWork,
  };

  const scoreDetails = calculateDailyScoreDetails(stats);
  const level = getReportLevel(scoreDetails.score);

  return {
    ...stats,
    level,
    scoreDetails,
  };
};

export function DailyReport() {
  const { t, i18n } = useTranslation();
  const { settings } = useAppStore();
  const moreRestEnabled = settings.moreRestEnabled;
  const [reports, setReports] = useState<ReportCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeReport, setActiveReport] = useState<ReportCardData | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const cursorEndRef = useRef<Date>(endOfLocalDay(new Date()));
  const earliestStartMsRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);
  const hasMoreRef = useRef(true);
  const inFlightSeqRef = useRef<number | null>(null);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  // 时长格式化：用于统计指标展示
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}${t('common.hours')} ${minutes}${t('common.minutes')}`;
    }
    return `${minutes}${t('common.minutes')}`;
  };

  const formatReportDate = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(date));

  useEffect(() => {
    if (!activeReport) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveReport(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeReport]);

  const penaltyItems = activeReport
    ? [
        {
          key: 'continuous',
          show: activeReport.scoreDetails.continuousPenalty > 0,
          label: t('dailyReport.details.continuousPenalty', {
            count: activeReport.scoreDetails.continuousSteps,
          }),
          points: activeReport.scoreDetails.continuousPenalty,
        },
        {
          key: 'screen-base',
          show: activeReport.scoreDetails.screenBasePenalty > 0,
          label: t('dailyReport.details.screenBasePenalty'),
          points: activeReport.scoreDetails.screenBasePenalty,
        },
        {
          key: 'screen-extra',
          show: activeReport.scoreDetails.screenExtraPenalty > 0,
          label: t('dailyReport.details.screenExtraPenalty', {
            count: activeReport.scoreDetails.screenExtraSteps,
          }),
          points: activeReport.scoreDetails.screenExtraPenalty,
        },
      ].filter((item) => item.show)
    : [];

  const fetchNextPage = useCallback(
    async (seq: number) => {
      const page: ReportCardData[] = [];
      let cursorEnd = cursorEndRef.current;

      while (page.length < PAGE_SIZE) {
        const earliestStartMs = earliestStartMsRef.current;
        if (earliestStartMs !== null && cursorEnd.getTime() < earliestStartMs) {
          break;
        }

        const windowEnd = endOfLocalDay(cursorEnd);
        const windowStart = startOfLocalDay(windowEnd);
        windowStart.setDate(windowStart.getDate() - (WINDOW_DAYS - 1));

        const query: AnalyticsQuery = {
          startDate: windowStart.toISOString(),
          endDate: windowEnd.toISOString(),
        };

        const data = await api.getAnalytics(query);
        if (requestSeqRef.current !== seq) {
          return {
            page: [] as ReportCardData[],
            nextCursorEnd: cursorEndRef.current,
            reachedEnd: false,
            aborted: true,
          };
        }

        const sessions = augmentSessionsWithMoreRest(data.sessions, moreRestEnabled);
        const sessionsByDay = groupSessionsByLocalDay(sessions);

        let lastProcessedDay = windowStart;

        for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
          const day = new Date(windowEnd);
          day.setDate(day.getDate() - offset);
          lastProcessedDay = day;

          const dayKey = toLocalDateKey(day);
          const daySessions = sessionsByDay.get(dayKey) ?? [];
          if (daySessions.length === 0) {
            continue;
          }

          const report = buildDailyReport(day, daySessions);
          if (!report) {
            continue;
          }

          page.push(report);
          if (page.length >= PAGE_SIZE) {
            break;
          }
        }

        cursorEnd = previousLocalDayEnd(lastProcessedDay);
      }

      const earliestStartMs = earliestStartMsRef.current;
      const reachedEnd = earliestStartMs !== null && cursorEnd.getTime() < earliestStartMs;

      return {
        page,
        nextCursorEnd: cursorEnd,
        reachedEnd,
        aborted: false,
      };
    },
    [moreRestEnabled]
  );

  const loadMore = useCallback(async () => {
    const seq = requestSeqRef.current;
    if (!hasMoreRef.current) return;
    if (inFlightSeqRef.current === seq) return;

    inFlightSeqRef.current = seq;
    setLoadingMore(true);

    try {
      const result = await fetchNextPage(seq);
      if (requestSeqRef.current !== seq || result.aborted) {
        return;
      }

      cursorEndRef.current = result.nextCursorEnd;

      if (result.page.length > 0) {
        setReports((prev) => [...prev, ...result.page]);
      }

      if (result.reachedEnd) {
        hasMoreRef.current = false;
        setHasMore(false);
      }
    } catch (error) {
      console.error('Failed to load more daily reports:', error);
    } finally {
      if (inFlightSeqRef.current === seq) {
        inFlightSeqRef.current = null;
      }
      if (requestSeqRef.current === seq) {
        setLoadingMore(false);
      }
    }
  }, [fetchNextPage]);

  useEffect(() => {
    let active = true;
    requestSeqRef.current += 1;
    const seq = requestSeqRef.current;

    hasMoreRef.current = true;
    setHasMore(true);
    setLoading(true);
    setLoadingMore(false);
    setReports([]);
    setActiveReport(null);
    cursorEndRef.current = endOfLocalDay(new Date());

    const loadInitial = async () => {
      try {
        const bounds = await api.getSessionsBounds();
        if (!active || requestSeqRef.current !== seq) return;

        const earliestStartMs = bounds.earliestStart
          ? new Date(bounds.earliestStart).getTime()
          : null;
        earliestStartMsRef.current = earliestStartMs;

        if (earliestStartMs === null) {
          hasMoreRef.current = false;
          setHasMore(false);
          return;
        }

        const result = await fetchNextPage(seq);
        if (!active || requestSeqRef.current !== seq || result.aborted) return;

        cursorEndRef.current = result.nextCursorEnd;
        setReports(result.page);

        if (result.reachedEnd) {
          hasMoreRef.current = false;
          setHasMore(false);
        }
      } catch (error) {
        console.error('Failed to load daily reports:', error);
      } finally {
        if (!active) return;
        if (requestSeqRef.current !== seq) return;
        setLoading(false);
      }
    };

    void loadInitial();

    return () => {
      active = false;
    };
  }, [fetchNextPage]);

  useEffect(() => {
    if (!hasMore) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: '240px 0px', threshold: 0 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, loadMore]);

  // 加载中状态
  if (loading) {
    return (
      <div className="page daily-report-page">
        <div className="container">
          <div className="loading">{t('common.loading')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page daily-report-page">
      <div className="container">
        <h1 className="page-title">{t('dailyReport.title')}</h1>
        
        {/* 无数据时展示空态 */}
        {reports.length === 0 ? (
          <div className="empty-state">
            <p>{t('dailyReport.empty')}</p>
          </div>
        ) : (
          <div className="report-timeline">
            {reports.map((report) => (
              <div key={report.date} className={`report-card-container`}>
                <div className={`timeline-dot level-${report.level}`} />
                <button
                  type="button"
                  className={`report-card level-${report.level}`}
                  onClick={() => setActiveReport(report)}
                >
                  <div className="report-date">{formatReportDate(report.date)}</div>
                  <div className="report-title">
                    {t(`dailyReport.templates.${report.level}.title`)}
                  </div>
                  <div className="report-message">
                    {t(`dailyReport.templates.${report.level}.message`)}
                  </div>
                  
                  <div className="report-metrics">
                    <div className="metric-item">
                      <span className="metric-value">{formatDuration(report.workDuration)}</span>
                      <span className="metric-label">{t('dailyReport.metrics.workDuration')}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-value">{formatDuration(report.restDuration)}</span>
                      <span className="metric-label">{t('dailyReport.metrics.restDuration')}</span>
                    </div>
                    <div className="metric-item">
                      <span className="metric-value">{report.completionRate}%</span>
                      <span className="metric-label">{t('dailyReport.metrics.completionRate')}</span>
                    </div>
                  </div>
                </button>
              </div>
            ))}

            {hasMore && (
              <div
                ref={sentinelRef}
                aria-hidden="true"
                style={{ height: 1, width: '100%' }}
              />
            )}

            {loadingMore && (
              <div className="loading" style={{ padding: '1rem 0', textAlign: 'center' }}>
                {t('common.loading')}
              </div>
            )}
          </div>
        )}
        {activeReport && (
          <div
            className="daily-report-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-report-score-title"
            onClick={() => setActiveReport(null)}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
          >
            <div
              className="daily-report-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="daily-report-modal-header">
                <div>
                  <h2 className="daily-report-modal-title" id="daily-report-score-title">
                    {t('dailyReport.details.title')}
                  </h2>
                  <div className="daily-report-modal-date">{formatReportDate(activeReport.date)}</div>
                </div>
                <button
                  type="button"
                  className="daily-report-modal-close"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setActiveReport(null);
                  }}
                  aria-label={t('common.close')}
                >
                  ×
                </button>
              </div>
              <div className="daily-report-modal-body">
                <div className="daily-report-score">
                  <div className="daily-report-score-label">{t('dailyReport.details.scoreLabel')}</div>
                  <div className="daily-report-score-value">
                    {activeReport.scoreDetails.score}
                    <span className="daily-report-score-unit">/100</span>
                  </div>
                </div>
                <div className="daily-report-penalties">
                  <div className="daily-report-penalties-title">
                    {t('dailyReport.details.penaltyTitle')}
                  </div>
                  {penaltyItems.length === 0 ? (
                    <div className="daily-report-penalties-empty">{t('dailyReport.details.noPenalty')}</div>
                  ) : (
                    <ul className="daily-report-penalties-list">
                      {penaltyItems.map((item) => (
                        <li key={item.key} className="daily-report-penalty-item">
                          <span className="daily-report-penalty-label">{item.label}</span>
                          <span className="daily-report-penalty-value">
                            {t('dailyReport.details.penaltyValue', { points: item.points })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="daily-report-penalties-total">
                    <span className="daily-report-penalties-total-label">
                      {t('dailyReport.details.totalPenalty')}
                    </span>
                    <span className="daily-report-penalties-total-value">
                      {t('dailyReport.details.penaltyValue', {
                        points: activeReport.scoreDetails.appliedPenalty,
                      })}
                    </span>
                  </div>
                  {activeReport.scoreDetails.capped && (
                    <div className="daily-report-penalties-note">
                      {t('dailyReport.details.cappedNote')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

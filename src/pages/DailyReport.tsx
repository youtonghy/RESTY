import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as api from '../utils/api';
import type { AnalyticsQuery, Session } from '../types';
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
  title: string;
  message: string;
}

const MIN_EFFECTIVE_BREAK_SEC = 180;
const LONG_WORK_THRESHOLD_SEC = 60 * 60;
const VERY_LONG_WORK_THRESHOLD_SEC = 2 * 60 * 60;
const REST_RATIO_MIN = 0.05;
const REST_RATIO_IDEAL = 0.2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSessionSeconds = (session: Session) => {
  if (Number.isFinite(session.duration) && session.duration > 0) {
    return session.duration;
  }
  const diff = (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000;
  return Math.max(0, diff);
};

const getBreakResetThreshold = (session: Session) =>
  Math.max(MIN_EFFECTIVE_BREAK_SEC, session.plannedDuration * 0.5);

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

export function DailyReport() {
  const { t, i18n } = useTranslation();
  const [reports, setReports] = useState<ReportCardData[]>([]);
  const [loading, setLoading] = useState(true);

  // Helper to format duration
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}${t('common.hours')} ${minutes}${t('common.minutes')}`;
    }
    return `${minutes}${t('common.minutes')}`;
  };

  const getTemplate = (stats: DailyStats): { level: ReportLevel; title: string; message: string } => {
    const { completionRate, workDuration, restDuration, maxContinuousWork } = stats;

    const restRatio = workDuration > 0 ? restDuration / workDuration : 0;
    const restRatioScore = clamp(
      (restRatio - REST_RATIO_MIN) / (REST_RATIO_IDEAL - REST_RATIO_MIN),
      0,
      1
    );
    const completionScore = clamp(completionRate / 100, 0, 1);

    const longWorkPenalty =
      maxContinuousWork >= VERY_LONG_WORK_THRESHOLD_SEC
        ? 0.3
        : maxContinuousWork >= LONG_WORK_THRESHOLD_SEC
          ? 0.2
          : 0;

    const fatigueScore = clamp(restRatioScore * 0.6 + completionScore * 0.4 - longWorkPenalty, 0, 1);

    let level: ReportLevel = 'poor';

    if (fatigueScore >= 0.8) {
      level = 'excellent';
    } else if (fatigueScore >= 0.6) {
      level = 'good';
    } else if (fatigueScore >= 0.4) {
      level = 'fair';
    }

    return {
      level,
      title: t(`dailyReport.templates.${level}.title`),
      message: t(`dailyReport.templates.${level}.message`),
    };
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        
        const start = new Date(end);
        start.setDate(start.getDate() - 14); // Last 14 days
        start.setHours(0, 0, 0, 0);

        const query: AnalyticsQuery = {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
        };

        const data = await api.getAnalytics(query);
        
        // Group sessions by date
        const sessionsByDate = new Map<string, Session[]>();
        
        data.sessions.forEach(session => {
          const dateStr = new Date(session.startTime).toDateString(); // Groups by local date
          if (!sessionsByDate.has(dateStr)) {
            sessionsByDate.set(dateStr, []);
          }
          sessionsByDate.get(dateStr)?.push(session);
        });

        const dailyReports: ReportCardData[] = [];

        // Iterate through the last 14 days to ensure order
        for (let i = 0; i < 14; i++) {
          const d = new Date(end);
          d.setDate(d.getDate() - i);
          const dateKey = d.toDateString();
          const sessions = sessionsByDate.get(dateKey) || [];

          if (sessions.length === 0) continue; // Skip empty days

          let workSec = 0;
          let restSec = 0;
          let totalBreaks = 0;
          let completedBreaks = 0;

          sessions.forEach(s => {
            const dur = getSessionSeconds(s);
            if (s.type === 'work') {
              workSec += dur;
            } else if (s.type === 'break') {
              totalBreaks++;
              restSec += dur;
              if (!s.isSkipped) {
                completedBreaks++;
              }
            }
          });

          const maxContinuousWork = calculateMaxContinuousWork(sessions);

          // If very little activity, skip
          if (workSec < 60 && totalBreaks === 0) continue;

          const completionRate = totalBreaks > 0 ? Math.round((completedBreaks / totalBreaks) * 100) : 0;

          const stats: DailyStats = {
            date: d.toISOString(),
            workDuration: workSec,
            restDuration: restSec,
            totalBreaks,
            completedBreaks,
            completionRate,
            maxContinuousWork
          };

          const template = getTemplate(stats);

          dailyReports.push({
            ...stats,
            ...template
          });
        }

        setReports(dailyReports);
      } catch (err) {
        console.error('Failed to load daily reports:', err);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, [t]);

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
        
        {reports.length === 0 ? (
          <div className="empty-state">
            <p>{t('dailyReport.empty')}</p>
          </div>
        ) : (
          <div className="report-timeline">
            {reports.map((report) => (
              <div key={report.date} className={`report-card-container`}>
                <div className={`timeline-dot level-${report.level}`} />
                <div className={`report-card level-${report.level}`}>
                  <div className="report-date">
                    {new Intl.DateTimeFormat(i18n.language, { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    }).format(new Date(report.date))}
                  </div>
                  <div className="report-title">{report.title}</div>
                  <div className="report-message">{report.message}</div>
                  
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

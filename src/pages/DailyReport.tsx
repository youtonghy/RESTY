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
}

interface ReportCardData extends DailyStats {
  level: ReportLevel;
  title: string;
  message: string;
}

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
    const { completionRate, workDuration, restDuration } = stats;
    
    // Heuristics for report level
    // Excellent: High completion rate (>80%) OR (Good balance: rest is at least 15% of work)
    const restRatio = workDuration > 0 ? restDuration / workDuration : 0;
    
    let level: ReportLevel = 'poor';

    if (completionRate >= 80 || (completionRate >= 70 && restRatio >= 0.15)) {
      level = 'excellent';
    } else if (completionRate >= 60 || restRatio >= 0.1) {
      level = 'good';
    } else if (completionRate >= 30) {
      level = 'fair';
    } else {
      level = 'poor';
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
            const dur = (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 1000;
            if (s.type === 'work') {
              workSec += dur;
            } else if (s.type === 'break') {
              totalBreaks++;
              if (!s.isSkipped) {
                restSec += dur;
                completedBreaks++;
              }
            }
          });

          // If very little activity, skip
          if (workSec < 60 && totalBreaks === 0) continue;

          const completionRate = totalBreaks > 0 ? Math.round((completedBreaks / totalBreaks) * 100) : 0;

          const stats: DailyStats = {
            date: d.toISOString(),
            workDuration: workSec,
            restDuration: restSec,
            totalBreaks,
            completedBreaks,
            completionRate
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

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import { GradientTitle } from '../components/Dashboard/GradientTitle';
import { FeatureCard } from '../components/Dashboard/FeatureCard';
import { PercentCard } from '../components/Dashboard/PercentCard';
import { NextSlotCard } from '../components/Dashboard/NextSlotCard';
import { TipsCard } from '../components/Dashboard/TipsCard';
import { ThemeToggle } from '../components/Dashboard/ThemeToggle';
import './Dashboard.css';

/**
 * 仪表盘页面：苹果发布会风格的卡片式布局
 */
export function Dashboard() {
  const { t } = useTranslation();
  const { timerInfo, setTimerInfo } = useAppStore();

  useEffect(() => {
    // Load initial timer info
    api.getTimerInfo().then(setTimerInfo);

    // Listen for timer updates to keep display synchronized
    let unsubscribe: (() => void) | undefined;

    const setupTimerListener = async () => {
      unsubscribe = await api.onTimerUpdate((info) => {
        setTimerInfo(info);
      });
    };

    setupTimerListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [setTimerInfo]);

  // Status calculations
  const isWorkPhase = timerInfo.phase === 'work';
  const isBreakPhase = timerInfo.phase === 'break';
  const isIdlePhase = timerInfo.phase === 'idle';
  const isRunning = timerInfo.state === 'running';

  const getStatusInfo = () => {
    if (isWorkPhase) {
      return {
        status: t('dashboard.working'),
        description: t('dashboard.workMessage'),
        indicator: 'working'
      };
    }
    if (isBreakPhase) {
      return {
        status: t('dashboard.breaking'),
        description: t('dashboard.breakMessage'),
        indicator: 'break'
      };
    }
    return {
      status: t('dashboard.idle'),
      description: t('dashboard.idleMessage'),
      indicator: 'idle'
    };
  };

  // Progress calculations
  const calculateProgress = () => {
    const now = new Date();
    const timezoneOffset = now.getTimezoneOffset() * 60 * 1000; // Convert to milliseconds
    const localNow = new Date(now.getTime() - timezoneOffset);

    // Day progress
    const dayStart = new Date(localNow);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(localNow);
    dayEnd.setHours(23, 59, 59, 999);
    const dayProgress = ((localNow.getTime() - dayStart.getTime()) / (dayEnd.getTime() - dayStart.getTime())) * 100;

    // Week progress (ISO week starts on Monday)
    const weekStart = new Date(localNow);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    const weekProgress = ((localNow.getTime() - weekStart.getTime()) / (weekEnd.getTime() - weekStart.getTime())) * 100;

    // Month progress
    const monthStart = new Date(localNow.getFullYear(), localNow.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(localNow.getFullYear(), localNow.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    const monthProgress = ((localNow.getTime() - monthStart.getTime()) / (monthEnd.getTime() - monthStart.getTime())) * 100;

    // Year progress
    const yearStart = new Date(localNow.getFullYear(), 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(localNow.getFullYear() + 1, 0, 1);
    yearEnd.setHours(0, 0, 0, -1);
    const yearProgress = ((localNow.getTime() - yearStart.getTime()) / (yearEnd.getTime() - yearStart.getTime())) * 100;

    return {
      day: Math.min(dayProgress, 100),
      week: Math.min(weekProgress, 100),
      month: Math.min(monthProgress, 100),
      year: Math.min(yearProgress, 100)
    };
  };

  const progress = calculateProgress();

  // Mock next slots data (this would come from your backend/scheduler)
  const getNextWorkTime = () => {
    // Example: next work session starts 2 hours from now
    const nextWork = new Date();
    nextWork.setHours(nextWork.getHours() + 2);
    return nextWork.toISOString();
  };

  const getNextBreakTime = () => {
    // Example: next break starts in 30 minutes
    const nextBreak = new Date();
    nextBreak.setMinutes(nextBreak.getMinutes() + 30);
    return nextBreak.toISOString();
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="page dashboard">
      <ThemeToggle />

      <div className="dashboard-container">
        <GradientTitle>RESTY</GradientTitle>

        <div className="dashboard-grid">
          {/* Current Status Card */}
          <FeatureCard
            icon={isWorkPhase ? '💼' : isBreakPhase ? '☕' : '⏱️'}
            title={t('dashboard.currentStatus')}
            className="status-card"
          >
            <div className="status-badge">
              <div className={`status-indicator ${statusInfo.indicator}`} />
              <span>{statusInfo.status}</span>
            </div>
            <div className="card-secondary">{statusInfo.description}</div>
          </FeatureCard>

          {/* Next Work Card */}
          <NextSlotCard
            type="work"
            time={getNextWorkTime()}
          />

          {/* Next Break Card */}
          <NextSlotCard
            type="break"
            time={getNextBreakTime()}
          />

          {/* Progress Cards */}
          <PercentCard
            icon="📅"
            title={t('dashboard.dayProgress')}
            percentage={progress.day}
          />

          <PercentCard
            icon="📆"
            title={t('dashboard.weekProgress')}
            percentage={progress.week}
          />

          <PercentCard
            icon="📊"
            title={t('dashboard.monthProgress')}
            percentage={progress.month}
          />

          <PercentCard
            icon="📈"
            title={t('dashboard.yearProgress')}
            percentage={progress.year}
          />

          {/* Tips Card */}
          <TipsCard />
        </div>
      </div>
    </div>
  );
}

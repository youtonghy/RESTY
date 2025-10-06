import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import './Dashboard.css';

/**
 * 仪表盘页面：展示当前番茄钟状态，并提供快速操作入口。
 */
export function Dashboard() {
  const { t } = useTranslation();
  const { timerInfo, setTimerInfo } = useAppStore();

  useEffect(() => {
    // Load initial timer info
    api.getTimerInfo().then(setTimerInfo);
  }, [setTimerInfo]);

  const safeRemainingSeconds = Math.max(0, timerInfo.remainingSeconds);
  const timeDisplay = useMemo(() => {
    const minutes = Math.floor(safeRemainingSeconds / 60);
    const seconds = safeRemainingSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [safeRemainingSeconds]);

  const progress = useMemo(() => {
    if (timerInfo.totalSeconds <= 0) {
      return 0;
    }
    return Math.min(safeRemainingSeconds / timerInfo.totalSeconds, 1);
  }, [safeRemainingSeconds, timerInfo.totalSeconds]);

  const isRunning = timerInfo.state === 'running';
  const isStopped = timerInfo.state === 'stopped';
  const isWorkPhase = timerInfo.phase === 'work';
  const isBreakPhase = timerInfo.phase === 'break';

  const getPhaseIcon = () => {
    if (isWorkPhase) return '💼';
    if (isBreakPhase) return '☕';
    return '⏱️';
  };

  const getPhaseLabel = () => {
    if (isWorkPhase) return t('reminder.title.work');
    if (isBreakPhase) return t('reminder.title.break');
    return t('app.name');
  };

  const getPhaseColor = () => {
    if (isWorkPhase) return '#667eea';
    if (isBreakPhase) return '#48bb78';
    return '#cbd5e0';
  };

  return (
    <div className="page dashboard">
      <div className="container">
        {/* Minimal Timer Display */}
        <section className="timer-display-minimal">
          {/* Status Badge */}
          <div className="status-badge" style={{ backgroundColor: getPhaseColor() }}>
            <span className="status-icon">{getPhaseIcon()}</span>
            <span className="status-text">{getPhaseLabel()}</span>
          </div>

          {/* Large Timer Circle */}
          <div className="timer-circle-container">
            <svg className="timer-svg" viewBox="0 0 400 400">
              {/* Background Circle */}
              <circle
                className="timer-bg"
                cx="200"
                cy="200"
                r="180"
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="16"
              />
              {/* Progress Circle */}
              {!isStopped && (
                <circle
                  className="timer-progress"
                  cx="200"
                  cy="200"
                  r="180"
                  fill="none"
                  stroke={getPhaseColor()}
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 180}`}
                  strokeDashoffset={`${2 * Math.PI * 180 * (1 - progress)}`}
                  transform="rotate(-90 200 200)"
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              )}
            </svg>

            {/* Time Display */}
            <div className="timer-content">
              <div className="timer-time">{timeDisplay}</div>
              <div className="timer-subtitle">
                {isRunning ? t('common.running') : t('common.stopped')}
              </div>
            </div>
          </div>
          {/* Simple Info */}
          <div className="timer-info">
            <p className="timer-hint">
              {isWorkPhase && t('dashboard.workMessage')}
              {isBreakPhase && t('dashboard.breakMessage')}
              {!isWorkPhase && !isBreakPhase && t('dashboard.idleMessage')}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

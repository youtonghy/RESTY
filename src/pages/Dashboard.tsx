import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import './Dashboard.css';

export function Dashboard() {
  const { t } = useTranslation();
  const { timerInfo, setTimerInfo } = useAppStore();
  const [timeDisplay, setTimeDisplay] = useState('00:00');

  useEffect(() => {
    // Load initial timer info
    api.getTimerInfo().then(setTimerInfo);
  }, [setTimerInfo]);

  useEffect(() => {
    const minutes = Math.floor(timerInfo.remainingSeconds / 60);
    const seconds = timerInfo.remainingSeconds % 60;
    setTimeDisplay(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
  }, [timerInfo.remainingSeconds]);

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

  const handleTakeBreak = async () => {
    try {
      await api.startBreak();
    } catch (error) {
      console.error('Failed to start break:', error);
    }
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
                  strokeDashoffset={`${
                    2 * Math.PI * 180 * (1 - timerInfo.remainingSeconds / timerInfo.totalSeconds)
                  }`}
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

          {/* Take Break Button - Only show during work phase */}
          {isWorkPhase && (
            <button className="btn-take-break" onClick={handleTakeBreak}>
              <span className="btn-icon">☕</span>
              <span>{t('dashboard.takeBreak')}</span>
            </button>
          )}

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

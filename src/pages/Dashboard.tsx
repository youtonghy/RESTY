import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import './Dashboard.css';

/**
 * 仪表盘页面：展示当前番茄钟状态，并提供快速操作入口。
 */
export function Dashboard() {
  const { t } = useTranslation();
  const { timerInfo, setTimerInfo, settings } = useAppStore();
  const [displaySeconds, setDisplaySeconds] = useState(timerInfo.remainingSeconds);
  const [timeDisplay, setTimeDisplay] = useState('00:00');
  const latestRemainingRef = useRef(timerInfo.remainingSeconds);
  const lastSyncRef = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Load initial timer info
    api.getTimerInfo().then(setTimerInfo);
  }, [setTimerInfo]);

  useEffect(() => {
    latestRemainingRef.current = timerInfo.remainingSeconds;
    lastSyncRef.current = Date.now();
    setDisplaySeconds(timerInfo.remainingSeconds);
  }, [timerInfo.remainingSeconds]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (timerInfo.state !== 'running') {
      return;
    }

    const startRemaining = timerInfo.remainingSeconds;
    latestRemainingRef.current = startRemaining;
    lastSyncRef.current = Date.now();
    setDisplaySeconds(startRemaining);

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastSyncRef.current) / 1000);
      const baseSeconds = latestRemainingRef.current;
      const nextValue = Math.max(baseSeconds - elapsed, 0);
      setDisplaySeconds((prev) => (prev === nextValue ? prev : nextValue));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [timerInfo.state]);

  useEffect(() => {
    const minutes = Math.floor(displaySeconds / 60);
    const seconds = displaySeconds % 60;
    setTimeDisplay(`${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
  }, [displaySeconds]);

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
    const fullscreen = settings.reminderMode === 'fullscreen';

    try {
      await api.startBreak();
    } catch (error) {
      console.error('Failed to start break:', error);
      return;
    }

    api.openReminderWindow(fullscreen).catch((error) => {
      console.error('Failed to open reminder window:', error);
    });

    try {
      const updatedInfo = await api.getTimerInfo();
      setTimerInfo(updatedInfo);
    } catch (error) {
      console.error('Failed to refresh timer info:', error);
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
            <button
              className="btn-take-break"
              onClick={handleTakeBreak}
              aria-label={t('dashboard.takeBreak')}
            >
              <span className="btn-icon">☕</span>
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

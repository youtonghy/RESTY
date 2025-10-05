import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
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

  const handleStartWork = async () => {
    try {
      await api.startWork();
    } catch (error) {
      console.error('Failed to start work:', error);
    }
  };

  const handleStartBreak = async () => {
    try {
      await api.startBreak();
    } catch (error) {
      console.error('Failed to start break:', error);
    }
  };

  const handlePause = async () => {
    try {
      if (timerInfo.state === 'running') {
        await api.pauseTimer();
      } else if (timerInfo.state === 'paused') {
        await api.resumeTimer();
      }
    } catch (error) {
      console.error('Failed to toggle pause:', error);
    }
  };

  const handleSkip = async () => {
    try {
      await api.skipPhase();
    } catch (error) {
      console.error('Failed to skip:', error);
    }
  };

  const isRunning = timerInfo.state === 'running';
  const isPaused = timerInfo.state === 'paused';
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

  const getStatusColor = () => {
    if (isRunning && isWorkPhase) return 'status-work';
    if (isRunning && isBreakPhase) return 'status-break';
    if (isPaused) return 'status-paused';
    return 'status-idle';
  };

  return (
    <div className="page dashboard">
      <div className="container">
        {/* Header */}
        <header className="dashboard-header">
          <h1 className="app-logo">
            <span className="logo-icon">👁️</span>
            {t('app.name')}
          </h1>
          <p className="app-description">{t('app.description')}</p>
        </header>

        {/* Main Timer Display */}
        <section className="timer-display">
          <div className={`timer-status ${getStatusColor()}`}>
            <div className="timer-status-icon">{getPhaseIcon()}</div>
            <div className="timer-status-text">{getPhaseLabel()}</div>
          </div>

          <div className="timer-circle-large">
            <svg className="timer-svg-large" viewBox="0 0 300 300">
              <circle
                className="timer-bg-large"
                cx="150"
                cy="150"
                r="135"
                fill="none"
                stroke="currentColor"
                strokeWidth="12"
                opacity="0.1"
              />
              {!isStopped && (
                <circle
                  className="timer-progress-large"
                  cx="150"
                  cy="150"
                  r="135"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 135}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 135 * (1 - timerInfo.remainingSeconds / timerInfo.totalSeconds)
                  }`}
                  transform="rotate(-90 150 150)"
                />
              )}
            </svg>
            <div className="timer-text-large">
              <div className="timer-time-large">{timeDisplay}</div>
              {!isStopped && (
                <div className="timer-label-large">
                  {isRunning ? 'Running' : isPaused ? 'Paused' : 'Ready'}
                </div>
              )}
            </div>
          </div>

          {/* Timer Controls */}
          <div className="timer-controls">
            {isStopped && (
              <>
                <button className="btn btn-primary btn-xl" onClick={handleStartWork}>
                  <span className="btn-icon">▶️</span>
                  {t('tray.startWork')}
                </button>
                <button className="btn btn-secondary btn-xl" onClick={handleStartBreak}>
                  <span className="btn-icon">☕</span>
                  {t('tray.startBreak')}
                </button>
              </>
            )}

            {!isStopped && (
              <>
                <button className="btn btn-primary btn-xl" onClick={handlePause}>
                  <span className="btn-icon">{isRunning ? '⏸️' : '▶️'}</span>
                  {isRunning ? t('tray.pause') : t('tray.resume')}
                </button>
                <button className="btn btn-secondary btn-lg" onClick={handleSkip}>
                  <span className="btn-icon">⏭️</span>
                  {t('shortcuts.skip')}
                </button>
              </>
            )}
          </div>
        </section>

        {/* Quick Actions */}
        <section className="quick-actions">
          <Link to="/analytics" className="quick-action-card">
            <div className="quick-action-icon">📊</div>
            <div className="quick-action-label">{t('tray.analytics')}</div>
          </Link>

          <Link to="/settings" className="quick-action-card">
            <div className="quick-action-icon">⚙️</div>
            <div className="quick-action-label">{t('tray.settings')}</div>
          </Link>
        </section>

        {/* Info Cards */}
        <section className="info-cards">
          <div className="info-card">
            <h3 className="info-card-title">Quick Tips</h3>
            <ul className="info-list">
              <li>Take regular breaks to reduce eye strain</li>
              <li>Follow the 20-20-20 rule: Every 20 minutes, look at something 20 feet away for 20 seconds</li>
              <li>Adjust your monitor brightness to match your environment</li>
              <li>Keep your screen at arm's length distance</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

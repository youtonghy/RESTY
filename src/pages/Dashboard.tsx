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

  const isStopped = timerInfo.state === 'stopped';
  const isWorkPhase = timerInfo.phase === 'work';
  const isBreakPhase = timerInfo.phase === 'break';

  const progress = useMemo(() => {
    if (timerInfo.totalMinutes <= 0) {
      return 0;
    }
    return Math.min(timerInfo.remainingMinutes / timerInfo.totalMinutes, 1);
  }, [timerInfo.remainingMinutes, timerInfo.totalMinutes]);

  const nextTransitionDisplay = useMemo(() => {
    if (!timerInfo.nextTransitionTime) {
      return '--:--';
    }
    const time = new Date(timerInfo.nextTransitionTime);
    if (Number.isNaN(time.getTime())) {
      return '--:--';
    }
    return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [timerInfo.nextTransitionTime]);

  const nextTransitionLabel = useMemo(() => {
    if (!timerInfo.nextTransitionTime) {
      return t('dashboard.nextEventUnavailable');
    }
    if (isWorkPhase) {
      return t('dashboard.nextBreakAt', { time: nextTransitionDisplay });
    }
    if (isBreakPhase) {
      return t('dashboard.nextWorkAt', { time: nextTransitionDisplay });
    }
    return t('dashboard.nextEventUnavailable');
  }, [isWorkPhase, isBreakPhase, nextTransitionDisplay, t, timerInfo.nextTransitionTime]);

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
              <div className="timer-time">{nextTransitionDisplay}</div>
              <div className="timer-subtitle">{nextTransitionLabel}</div>
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

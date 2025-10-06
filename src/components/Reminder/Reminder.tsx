import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import * as api from '../../utils/api';
import './Reminder.css';

interface ReminderProps {
  isFullscreen?: boolean;
}

export function Reminder({ isFullscreen = true }: ReminderProps) {
  const { t } = useTranslation();
  const { timerInfo, settings } = useAppStore();

  const safeRemainingMinutes = Math.max(0, timerInfo.remainingMinutes);
  const progress = useMemo(() => {
    if (timerInfo.totalMinutes <= 0) {
      return 0;
    }
    return Math.min(safeRemainingMinutes / timerInfo.totalMinutes, 1);
  }, [safeRemainingMinutes, timerInfo.totalMinutes]);

  const timeDisplay = `${String(safeRemainingMinutes).padStart(2, '0')}`;
  const countdownLabel = t('reminder.countdown', {
    time: `${safeRemainingMinutes} ${t('common.minutes')}`.trim(),
  });

  const isBreak = timerInfo.phase === 'break';
  const canSkip = !settings.enableForceBreak || !isBreak;

  const handleSkip = async () => {
    if (canSkip) {
      await api.skipPhase();
      await api.closeReminderWindow();
    }
  };

  const handleExtend = async () => {
    await api.extendPhase();
  };

  const handleStartBreak = async () => {
    await api.startBreak();
  };

  const handleClose = async () => {
    await api.closeReminderWindow();
  };

  return (
    <div className={`reminder ${isFullscreen ? 'reminder-fullscreen' : 'reminder-floating'}`}>
      <div className="reminder-content">
        <div className="reminder-icon">
          {isBreak ? '👀' : '💪'}
        </div>

        <h1 className="reminder-title">
          {isBreak ? t('reminder.title.break') : t('reminder.title.work')}
        </h1>

        <p className="reminder-message">
          {isBreak ? t('reminder.message.break') : t('reminder.message.work')}
        </p>

        <div className="reminder-timer">
          <div className="timer-circle">
            <svg className="timer-svg" viewBox="0 0 200 200">
              <circle
                className="timer-bg"
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                opacity="0.2"
              />
              <circle
                className="timer-progress"
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 90}`}
                strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress)}`}
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="timer-text">
              <div className="timer-time">{timeDisplay}</div>
              <div className="timer-label">{countdownLabel}</div>
            </div>
          </div>
        </div>

        <div className="reminder-actions">
          {!isBreak && (
            <button className="btn btn-primary btn-lg" onClick={handleStartBreak}>
              {t('reminder.actions.startBreak')}
            </button>
          )}

          {canSkip && (
            <button className="btn btn-secondary btn-lg" onClick={handleSkip}>
              {t('reminder.actions.skip')}
            </button>
          )}

          <button className="btn btn-secondary btn-lg" onClick={handleExtend}>
            {t('reminder.actions.extend')}
          </button>

          {!isFullscreen && (
            <button className="btn btn-ghost btn-sm reminder-close" onClick={handleClose}>
              ✕
            </button>
          )}
        </div>

        {settings.enableForceBreak && isBreak && (
          <p className="reminder-note">{t('settings.timer.forceBreakDescription')}</p>
        )}
      </div>
    </div>
  );
}

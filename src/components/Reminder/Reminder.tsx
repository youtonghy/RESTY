import { useEffect, useState } from 'react';
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
  const [optimisticMinutes, setOptimisticMinutes] = useState<number | null>(null);
  const safeRemainingMinutes = Math.max(0, timerInfo.remainingMinutes);
  const isBreak = timerInfo.phase === 'break';
  const canSkip = !settings.enableForceBreak || !isBreak;
  const displayMinutes = optimisticMinutes ?? safeRemainingMinutes;
  const formattedTime = `${String(displayMinutes).padStart(2, '0')}:00`;

  const handleSkip = async () => {
    if (canSkip) {
      setOptimisticMinutes(null);
      await api.skipPhase();
      await api.closeReminderWindow();
    }
  };

  const handleExtend = async () => {
    // Optimistically bump by 5 minutes for immediate UI feedback
    setOptimisticMinutes((prev) => {
      const base = prev ?? safeRemainingMinutes;
      return base + 5;
    });
    try {
      await api.extendPhase();
    } catch (err) {
      // Revert optimistic update on failure
      setOptimisticMinutes(null);
      console.error('Failed to extend phase:', err);
    }
  };

  // Reconcile optimistic state when real timer info catches up
  useEffect(() => {
    if (optimisticMinutes != null && safeRemainingMinutes >= optimisticMinutes) {
      setOptimisticMinutes(null);
    }
    // Also clear if phase changes away from break
    if (timerInfo.phase !== 'break' && optimisticMinutes != null) {
      setOptimisticMinutes(null);
    }
  }, [safeRemainingMinutes, timerInfo.phase, optimisticMinutes]);

  const skipLabel = t('reminder.actions.skip');
  const extendLabel = t('reminder.actions.extendShort');
  const timerLabel = t('reminder.simpleLabel');

  const phaseClass = `phase-${timerInfo.phase ?? 'break'}`;

  return (
    <div className={`reminder ${isFullscreen ? 'reminder-fullscreen' : 'reminder-floating'} ${phaseClass}`}>
      <div className="reminder-panel" role="dialog" aria-label={t('reminder.simpleLabel')}>
        <div className="reminder-content">
          <div className="reminder-simple-label">{timerLabel}</div>
          <div className="reminder-simple-timer" aria-live="polite">{formattedTime}</div>

          <div className="reminder-actions">
            <button
              className="btn btn-secondary btn-lg"
              onClick={handleSkip}
              disabled={!canSkip}
              title={!canSkip && isBreak ? t('reminder.forceBreakTooltip') : undefined}
            >
              {skipLabel}
            </button>

            <button className="btn btn-primary btn-lg" onClick={handleExtend}>
              {extendLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

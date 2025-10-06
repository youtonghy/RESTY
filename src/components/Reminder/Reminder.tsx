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
  const isBreak = timerInfo.phase === 'break';
  const canSkip = !settings.enableForceBreak || !isBreak;
  const formattedTime = `${String(safeRemainingMinutes).padStart(2, '0')}:00`;

  const handleSkip = async () => {
    if (canSkip) {
      await api.skipPhase();
      await api.closeReminderWindow();
    }
  };

  const handleExtend = async () => {
    await api.extendPhase();
  };

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

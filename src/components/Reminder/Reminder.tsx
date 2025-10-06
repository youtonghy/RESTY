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

  const handleSkip = async () => {
    if (canSkip) {
      await api.skipPhase();
      await api.closeReminderWindow();
    }
  };

  const handleExtend = async () => {
    await api.extendPhase();
  };

  return (
    <div className={`reminder ${isFullscreen ? 'reminder-fullscreen' : 'reminder-floating'}`}>
      <div className="reminder-content">
        <p className="reminder-simple-timer">
          {t('reminder.simpleBreakTime', { minutes: safeRemainingMinutes })}
        </p>

        <div className="reminder-actions">
          {canSkip && (
            <button className="btn btn-secondary btn-lg" onClick={handleSkip}>
              {t('reminder.actions.skip')}
            </button>
          )}

          <button className="btn btn-primary btn-lg" onClick={handleExtend}>
            {t('reminder.actions.extend5min')}
          </button>
        </div>
      </div>
    </div>
  );
}

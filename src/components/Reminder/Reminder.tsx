import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import * as api from '../../utils/api';
import './Reminder.css';
import { useTheme } from '../Common/ThemeProvider';

interface ReminderProps {
  isFullscreen?: boolean;
}

export function Reminder({ isFullscreen = true }: ReminderProps) {
  const { t } = useTranslation();
  const { timerInfo, settings } = useAppStore();
  const { effectiveTheme } = useTheme();
  const [optimisticMinutes, setOptimisticMinutes] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const safeRemainingMinutes = Math.max(0, timerInfo.remainingMinutes);
  const isBreak = timerInfo.phase === 'break';
  const canSkip = !settings.enableForceBreak || !isBreak;
  // Compute base remaining seconds using nextTransitionTime for higher precision
  const computeBaseSeconds = useMemo(() => {
    return () => {
      let baseSeconds = safeRemainingMinutes * 60;
      if (timerInfo.nextTransitionTime) {
        const endTs = Date.parse(timerInfo.nextTransitionTime);
        if (!Number.isNaN(endTs)) {
          const nowTs = Date.now();
          baseSeconds = Math.max(0, Math.floor((endTs - nowTs) / 1000));
        }
      }
      // Apply optimistic extension (if any)
      if (optimisticMinutes != null) {
        const deltaMin = Math.max(0, optimisticMinutes - safeRemainingMinutes);
        baseSeconds += deltaMin * 60;
      }
      return baseSeconds;
    };
  }, [timerInfo.nextTransitionTime, safeRemainingMinutes, optimisticMinutes]);

  const [displaySeconds, setDisplaySeconds] = useState<number>(() => computeBaseSeconds());

  // Keep local seconds ticking smoothly
  useEffect(() => {
    setDisplaySeconds(computeBaseSeconds());
    const id = setInterval(() => {
      setDisplaySeconds((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [computeBaseSeconds]);

  const mm = Math.floor(displaySeconds / 60);
  const ss = displaySeconds % 60;
  const formattedTime = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

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

  // Reveal the window, then mark ready to trigger panel fade-in
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      // Show the hidden window as soon as we have a frame
      api
        .showReminderWindow()
        .catch((err) => console.error('Failed to show reminder window:', err));
      // Next frame, enable fade-in for panel
      raf2 = requestAnimationFrame(() => setIsReady(true));
    });
    return () => {
      if (raf1) cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  const rootClassName = [
    'reminder',
    isFullscreen ? 'reminder-fullscreen' : 'reminder-floating',
    phaseClass,
    `theme-${effectiveTheme}`,
    isReady ? 'is-ready' : '',
  ].join(' ');

  return (
    <div className={rootClassName}>
      <div className="reminder-scene" aria-hidden="true">
        <div className="scene-group scene-day">
          <div className="scene scene-day-sky" />
          <div className="scene scene-day-sun" />
          <div className="scene scene-day-mountain scene-day-mountain-back" />
          <div className="scene scene-day-mountain scene-day-mountain-front" />
          <div className="scene scene-day-water" />
          <div className="scene scene-day-cloud scene-day-cloud-1" />
          <div className="scene scene-day-cloud scene-day-cloud-2" />
        </div>
        <div className="scene-group scene-night">
          <div className="scene scene-night-sky" />
          <div className="scene scene-night-stars" />
          <div className="scene scene-night-moon" />
          <div className="scene scene-night-city scene-night-city-back" />
          <div className="scene scene-night-city scene-night-city-front" />
          <div className="scene scene-night-haze" />
        </div>
        <div className="scene-phase-overlay" />
      </div>
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

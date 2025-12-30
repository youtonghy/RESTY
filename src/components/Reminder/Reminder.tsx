import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import * as api from '../../utils/api';
import './Reminder.css';
import { useTheme } from '../Common/ThemeProvider';
import { Dashboard } from '../../pages/Dashboard';

interface ReminderProps {
  isFullscreen?: boolean;
}

const TIMER_SYNC_KEY = 'resty-timer-sync';

export function Reminder({ isFullscreen = true }: ReminderProps) {
  const { t, i18n } = useTranslation();
  const { timerInfo, settings, setTimerInfo } = useAppStore();
  const { effectiveTheme } = useTheme();
  const [optimisticSeconds, setOptimisticSeconds] = useState<number | null>(null);
  const [optimisticTargetTotal, setOptimisticTargetTotal] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);
  const safeRemainingSeconds = Math.max(0, timerInfo.remainingSeconds);
  const isBreak = timerInfo.phase === 'break';
  const canSkip = !settings.enableForceBreak || !isBreak;
  const isPanelDisplay =
    isFullscreen && settings.reminderFullscreenDisplay === 'panel';
  const isZh = i18n.language.startsWith('zh');
  // Compute base remaining seconds using nextTransitionTime for higher precision
  const computeBaseSeconds = useMemo(() => {
    return () => {
      let baseSeconds = safeRemainingSeconds;
      if (timerInfo.nextTransitionTime) {
        const endTs = Date.parse(timerInfo.nextTransitionTime);
        if (!Number.isNaN(endTs)) {
          const nowTs = Date.now();
          baseSeconds = Math.max(0, Math.floor((endTs - nowTs) / 1000));
        }
      }
      // Apply optimistic extension (if any)
      if (optimisticSeconds != null) {
        const deltaSec = Math.max(0, optimisticSeconds - safeRemainingSeconds);
        baseSeconds += deltaSec;
      }
      return baseSeconds;
    };
  }, [timerInfo.nextTransitionTime, safeRemainingSeconds, optimisticSeconds]);

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
      setOptimisticSeconds(null);
      setOptimisticTargetTotal(null);
      await api.skipPhase();
      await api.closeReminderWindow();
    }
  };

  const broadcastTimerSync = () => {
    if (syncChannelRef.current) {
      syncChannelRef.current.postMessage('timer-sync');
      return;
    }
    try {
      localStorage.setItem(TIMER_SYNC_KEY, Date.now().toString());
    } catch (err) {
      console.warn('Failed to broadcast timer sync:', err);
    }
  };

  const handleExtend = async () => {
    // Optimistically bump by 5 minutes (300 seconds) for immediate UI feedback
    setOptimisticSeconds((prev) => {
      const base = prev ?? safeRemainingSeconds;
      return base + 300;
    });
    setOptimisticTargetTotal((prev) => {
      const base = prev ?? timerInfo.totalSeconds;
      return base + 300;
    });
    try {
      await api.extendPhase();
      try {
        const latest = await api.getTimerInfo();
        setTimerInfo(latest);
      } catch (err) {
        console.error('Failed to refresh timer info after extend:', err);
      }
      broadcastTimerSync();
    } catch (err) {
      // Revert optimistic update on failure
      setOptimisticSeconds(null);
      setOptimisticTargetTotal(null);
      console.error('Failed to extend phase:', err);
    }
  };

  // Reconcile optimistic state when real timer info catches up
  useEffect(() => {
    const shouldClearByTotal =
      optimisticTargetTotal != null && timerInfo.totalSeconds >= optimisticTargetTotal;
    const shouldClearByRemaining =
      optimisticSeconds != null && safeRemainingSeconds >= optimisticSeconds - 2;

    if (timerInfo.phase !== 'break' || shouldClearByTotal || shouldClearByRemaining) {
      if (optimisticSeconds != null) setOptimisticSeconds(null);
      if (optimisticTargetTotal != null) setOptimisticTargetTotal(null);
    }
  }, [
    safeRemainingSeconds,
    timerInfo.phase,
    timerInfo.totalSeconds,
    optimisticSeconds,
    optimisticTargetTotal,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const browserWindow = window as Window;

    const syncFromBackend = () => {
      api.getTimerInfo().then((info) => {
        setTimerInfo(info);
      }).catch((err) => {
        console.error('Failed to sync timer info:', err);
      });
    };

    if ('BroadcastChannel' in browserWindow) {
      const channel = new BroadcastChannel(TIMER_SYNC_KEY);
      syncChannelRef.current = channel;
      channel.onmessage = (event) => {
        if (event.data === 'timer-sync') {
          syncFromBackend();
        }
      };
      return () => {
        channel.close();
        syncChannelRef.current = null;
      };
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === TIMER_SYNC_KEY) {
        syncFromBackend();
      }
    };

    browserWindow.addEventListener('storage', handleStorage);
    return () => {
      browserWindow.removeEventListener('storage', handleStorage);
    };
  }, [setTimerInfo]);

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
    isPanelDisplay ? 'reminder-panel-mode' : '',
  ].join(' ');

  return (
    <div className={rootClassName}>
      {isPanelDisplay ? (
        <div className="reminder-dashboard">
          <Dashboard
            isReadOnly
            nextCardAction={{
              primary: formattedTime,
              secondary: t('dashboard.next.break', {
                defaultValue: isZh ? '下次休息' : 'Next break',
              }),
              onActivate: handleExtend,
              actionLabel: t('reminder.actions.extend5min'),
            }}
          />
        </div>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

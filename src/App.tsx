import { useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { ThemeProvider } from './components/Common/ThemeProvider';
import { Reminder } from './components/Reminder/Reminder';
import { TrayMenu } from './components/TrayMenu/TrayMenu';
import { Layout } from './components/Common/Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Analytics } from './pages/Analytics';
import { DailyReport } from './pages/DailyReport';
import { Achievements } from './pages/Achievements';
import { getAchievementDefinitionById } from './features/achievements/definitions';
import {
  clearRestStartsSoonNotification,
  listenPreBreakNotificationAction,
  notifyAchievementUnlocked,
  notifyRestStartsSoon,
} from './services/notifications';
import { useAppStore } from './store';
import type { Settings as AppSettings } from './types';
import * as api from './utils/api';
import { changeLanguage, normalizeLanguage } from './i18n';
import { isNewerVersion } from './utils/version';
import './App.css';
import './i18n';

/**
 * Helper to cleanup event unsubscribers safely
 */
const cleanupUnsubscribers = (
  unsubscribers: Array<Promise<() => void>>,
  isMountedRef: React.MutableRefObject<boolean>
) => {
  unsubscribers.forEach((p) =>
    p.then((unsub) => {
      // Only unsubscribe if component is still mounted or being unmounted
      // This prevents race conditions during rapid mount/unmount cycles
      unsub();
    }).catch((err) => {
      // Ignore errors during cleanup (component may have unmounted)
      if (isMountedRef.current) {
        console.warn('Failed to cleanup event listener:', err);
      }
    })
  );
};

/**
 * 根应用组件：负责初始化设置、监听 Tauri 后端事件，并配置全局路由/主题。
 */
function App() {
  const { i18n } = useTranslation();
  const { settings, timerInfo, setTimerInfo, setAppVersion, setUpdateManifest } = useAppStore();
  const analyticsDisabled = settings.disableAnalytics;

  const isReminderWindow = (() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash.startsWith('reminder');
  })();

  const isTrayMenuWindow = (() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash.startsWith('tray-menu');
  })();

  const isSpecialWindow = isReminderWindow || isTrayMenuWindow;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<string | null>(null);
  const notifiedAchievementKeysRef = useRef<Set<string>>(new Set());
  const preBreakNotifiedTargetRef = useRef<string | null>(null);

  const stopRestMusic = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    audioRef.current = null;
    currentTrackRef.current = null;
  }, []);

  const startRestMusic = useCallback(
    async (enabled: boolean, directory: string) => {
      if (isSpecialWindow) return;
      if (!enabled || !directory) {
        stopRestMusic();
        return;
      }

      const previousTrack = currentTrackRef.current;

      try {
        const files = await api.getRestMusicFiles();
        if (files.length === 0) {
          stopRestMusic();
          return;
        }

        let nextTrack = files[Math.floor(Math.random() * files.length)];
        if (files.length > 1 && previousTrack) {
          const maxAttempts = files.length;
          let attempts = 0;
          while (nextTrack === previousTrack && attempts < maxAttempts) {
            nextTrack = files[Math.floor(Math.random() * files.length)];
            attempts += 1;
          }
        }

        stopRestMusic();

        const audio = new Audio(convertFileSrc(nextTrack));
        audio.loop = true;

        try {
          await audio.play();
          audioRef.current = audio;
          currentTrackRef.current = nextTrack;
        } catch (error) {
          console.error('Failed to play rest music:', error);
          audioRef.current = null;
          currentTrackRef.current = null;
        }
      } catch (error) {
        console.error('Failed to load rest music files:', error);
        stopRestMusic();
      }
    },
    [isSpecialWindow, stopRestMusic]
  );

  useEffect(() => {
    // Track mounted state to prevent state updates after unmount
    const isMountedRef = { current: true };

    /**
     * 根据当前阶段控制提醒窗口（全屏或浮窗）。
     */
    // Helper to open/close reminder window based on phase
    const handleReminderForPhase = (phase: string, settingsOverride?: AppSettings) => {
      if (!isMountedRef.current) return;

      const activeSettings = settingsOverride ?? useAppStore.getState().settings;

      // Opening reminder window is handled by backend (timer service events) to avoid race conditions.
      // We only handle closing here to ensure windows are cleaned up when phase changes away from break.
      if (phase !== 'break') {
        api.closeReminderWindow().catch((error) => {
          console.error('Failed to close reminder window:', error);
        });
      }

      if (!isSpecialWindow) {
        if (phase === 'break') {
          void startRestMusic(activeSettings.restMusicEnabled, activeSettings.restMusicDirectory);
        } else {
          stopRestMusic();
        }
      }
    };

    // 初始化加载持久化设置，并同步语言环境
    api.loadSettings().then(async (loaded) => {
      if (!isMountedRef.current) return;

      const normalizedLanguage = normalizeLanguage(loaded.language);
      const normalizedSettings = {
        ...loaded,
        language: normalizedLanguage,
      } as AppSettings;

      useAppStore.getState().setSettings(normalizedSettings);
      await changeLanguage(normalizedLanguage);

      // Sync autostart with persisted setting
      api.setAutostart(loaded.autostart).catch((error) => {
        console.error('Failed to sync autostart on init:', error);
      });

      // Ensure main window is visible after frontend initialization (skip for reminder window)
      // This is a fallback in case backend setup didn't show the window
      if (!isSpecialWindow && !loaded.silentAutostart) {
        api.showMainWindow().catch((error) => {
          console.error('Failed to show main window:', error);
        });
      }
    }).catch((error) => {
      console.error('Failed to load settings:', error);
    });

    // Set up event listeners
    const unsubscribers: Array<Promise<() => void>> = [];

    // Listen for timer updates
    unsubscribers.push(
      api.onTimerUpdate((info) => {
        if (!isMountedRef.current) return;

        const store = useAppStore.getState();
        const previousPhase = store.timerInfo.phase;
        store.setTimerInfo(info);

        if (!isSpecialWindow) {
          const breakCompleted = previousPhase === 'break' && info.phase === 'work';
          const switchedToIdle = previousPhase !== 'idle' && info.phase === 'idle';
          if (breakCompleted || switchedToIdle) {
            preBreakNotifiedTargetRef.current = null;
            void clearRestStartsSoonNotification();
          }

          const preBreakEnabled = store.settings.restStartSoonNotificationEnabled;
          if (!preBreakEnabled) {
            if (preBreakNotifiedTargetRef.current) {
              preBreakNotifiedTargetRef.current = null;
              void clearRestStartsSoonNotification();
            }
          } else if (info.phase === 'work' && info.state === 'running') {
            const nextBreakTime = info.nextBreakTime ?? null;
            if (!nextBreakTime) {
              if (preBreakNotifiedTargetRef.current) {
                preBreakNotifiedTargetRef.current = null;
                void clearRestStartsSoonNotification();
              }
            } else {
              if (
                preBreakNotifiedTargetRef.current &&
                preBreakNotifiedTargetRef.current !== nextBreakTime
              ) {
                preBreakNotifiedTargetRef.current = null;
                void clearRestStartsSoonNotification();
              }

              if (preBreakNotifiedTargetRef.current !== nextBreakTime) {
                const millisUntilBreak = Date.parse(nextBreakTime) - Date.now();
                // 忽略阶段切换瞬间：work 阶段 remaining 归零时后端会先广播一次
                // nextBreakTime≈now+1s 的中间态，若不过滤会在进入休息的瞬间再弹一次
                // "休息即将开始" 提醒。同时 remainingSeconds 很小时已来不及作为提前通知。
                const isPhaseTransition = info.remainingSeconds <= 1;
                if (!isPhaseTransition && millisUntilBreak > 5_000 && millisUntilBreak <= 60_000) {
                  preBreakNotifiedTargetRef.current = nextBreakTime;
                  void notifyRestStartsSoon(
                    i18n.t('notifications.restStartSoon.title', {
                      defaultValue: 'Break starts soon',
                    }),
                    i18n.t('notifications.restStartSoon.body', {
                      defaultValue: 'Break starts in 1 minute.',
                    }),
                    {
                      dismiss: i18n.t('notifications.restStartSoon.dismissAction', {
                        defaultValue: 'Got it',
                      }),
                      breakNow: i18n.t('notifications.restStartSoon.breakNowAction', {
                        defaultValue: 'Break now',
                      }),
                    }
                  );
                }
              }
            }
          }
        }

        if (previousPhase !== info.phase) {
          handleReminderForPhase(info.phase, store.settings);
        }
      })
    );

    // Listen for phase changes
    unsubscribers.push(
      api.onPhaseChange((phase) => {
        if (!isMountedRef.current) return;
        console.log('Phase changed to:', phase);
        handleReminderForPhase(phase);
      })
    );

    // Listen for timer finished (for logging only)
    unsubscribers.push(
      api.onTimerFinished(() => {
        console.log('Timer finished');
      })
    );

    // For reminder window, proactively fetch timer info once for immediate render
    if (isSpecialWindow) {
      api.getTimerInfo().then((info) => {
        if (isMountedRef.current) {
          setTimerInfo(info);
        }
      }).catch((error) => {
        console.error('Failed to load timer info:', error);
      });
    }

    let preBreakActionListener: { unregister: () => void } | null = null;
    let preBreakNativeListenerDispose: (() => void) | null = null;
    if (!isSpecialWindow) {
      const handlePreBreakAction = (actionId: string) => {
        if (actionId !== 'dismiss' && actionId !== 'break-now') return;
        // 对于 "break-now" 立刻进入休息，阶段切换会由其它逻辑清理 ref；
        // 对于 "dismiss" 保留 ref，避免同一个 nextBreakTime 再次触发通知，
        // 否则点击“知道了”关闭通知后会立刻被下一次 timer 更新再弹出一次。
        if (actionId === 'break-now') {
          preBreakNotifiedTargetRef.current = null;
        }
        void clearRestStartsSoonNotification();
        if (actionId === 'break-now') {
          const currentPhase = useAppStore.getState().timerInfo.phase;
          const enterBreak =
            currentPhase === 'break' ? Promise.resolve() : api.startBreak();
          enterBreak.catch((error) => {
            console.error('Failed to start break immediately:', error);
          });
        }
      };

      void listenPreBreakNotificationAction(handlePreBreakAction).then((listener) => {
        if (!listener) return;
        if (!isMountedRef.current) {
          listener.unregister();
          return;
        }
        preBreakActionListener = listener;
      });

      api
        .onPreBreakAction(handlePreBreakAction)
        .then((unsub) => {
          if (!isMountedRef.current) {
            unsub();
            return;
          }
          preBreakNativeListenerDispose = unsub;
        })
        .catch((error) => {
          console.warn('Failed to register native pre-break action listener:', error);
        });
    }

    // 清理事件监听，避免内存泄漏
    return () => {
      isMountedRef.current = false;
      cleanupUnsubscribers(unsubscribers, isMountedRef);
      if (preBreakActionListener) {
        preBreakActionListener.unregister();
        preBreakActionListener = null;
      }
      if (preBreakNativeListenerDispose) {
        preBreakNativeListenerDispose();
        preBreakNativeListenerDispose = null;
      }
      if (!isSpecialWindow) {
        stopRestMusic();
        void clearRestStartsSoonNotification();
        preBreakNotifiedTargetRef.current = null;
      }
    };
  }, [i18n, isSpecialWindow, setTimerInfo, startRestMusic, stopRestMusic]);

  // Update language when settings change
  useEffect(() => {
    const lang = normalizeLanguage(settings.language);
    if (i18n.language !== lang) {
      changeLanguage(lang).catch((error) => {
        console.error('Failed to change language:', error);
      });
    }
  }, [settings.language, i18n]);

  useEffect(() => {
    if (isSpecialWindow) return;
    if (settings.restStartSoonNotificationEnabled) return;

    preBreakNotifiedTargetRef.current = null;
    void clearRestStartsSoonNotification();
  }, [isSpecialWindow, settings.restStartSoonNotificationEnabled]);

  useEffect(() => {
    if (isSpecialWindow) return;

    if (!settings.restMusicEnabled) {
      stopRestMusic();
      return;
    }

    if (timerInfo.phase === 'break') {
      void startRestMusic(settings.restMusicEnabled, settings.restMusicDirectory);
    }
  }, [
    isSpecialWindow,
    settings.restMusicEnabled,
    settings.restMusicDirectory,
    timerInfo.phase,
    startRestMusic,
    stopRestMusic,
  ]);

  useEffect(() => {
    if (isSpecialWindow) return;

    const checkForUpdates = async () => {
      try {
        const currentVersion = await getVersion();
        setAppVersion(currentVersion);

        const isWindowsPlatform =
          typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
        const shouldRunAutoSilentUpdate =
          isWindowsPlatform && settings.autoSilentUpdateEnabled;

        if (shouldRunAutoSilentUpdate) {
          setUpdateManifest(null);
          return;
        }

        const manifest = await api.checkForUpdates();
        if (manifest?.version && isNewerVersion(manifest.version, currentVersion)) {
          setUpdateManifest(manifest);
        } else {
          setUpdateManifest(null);
        }
      } catch (error) {
        console.error('Failed to check for updates:', error);
      }
    };

    void checkForUpdates();
  }, [isSpecialWindow, setAppVersion, setUpdateManifest, settings.autoSilentUpdateEnabled]);

  useEffect(() => {
    if (isSpecialWindow) {
      return;
    }

    const isMountedRef = { current: true };
    const unsubscribers: Array<Promise<() => void>> = [];

    unsubscribers.push(
      api.onAchievementUnlocked((achievement) => {
        if (!isMountedRef.current) {
          return;
        }

        const dedupeKey = `${achievement.id}:${achievement.unlockedAt ?? ''}`;
        if (notifiedAchievementKeysRef.current.has(dedupeKey)) {
          return;
        }
        notifiedAchievementKeysRef.current.add(dedupeKey);

        const definition = getAchievementDefinitionById(achievement.id);
        const achievementName = definition ? i18n.t(definition.titleKey) : achievement.id;

        void notifyAchievementUnlocked(
          i18n.t('achievements.unlockModal.title', { defaultValue: 'Achievement Unlocked' }),
          i18n.t('achievements.unlockModal.body', {
            defaultValue: 'Unlocked achievement: {{name}}',
            name: achievementName,
          })
        );
      })
    );

    return () => {
      isMountedRef.current = false;
      cleanupUnsubscribers(unsubscribers, isMountedRef);
    };
  }, [i18n, isSpecialWindow]);

  return (
    <ThemeProvider>
      {isTrayMenuWindow ? (
        <TrayMenu />
      ) : isReminderWindow ? (
        <Reminder isFullscreen={settings.reminderMode === 'fullscreen'} />
      ) : (
        <BrowserRouter>
          {/* Bridge: listen to backend events and navigate */}
          <RouteEventBridge />
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              {!analyticsDisabled && (
                <Route path="/daily-report" element={<DailyReport />} />
              )}
              <Route path="/settings" element={<Settings />} />
              {!analyticsDisabled && <Route path="/analytics" element={<Analytics />} />}
              {!analyticsDisabled && (
                <Route path="/achievements" element={<Achievements />} />
              )}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      )}
    </ThemeProvider>
  );
}

export default App;

/**
 * A tiny component that subscribes to backend events and performs router navigation.
 */
function RouteEventBridge() {
  const navigate = useNavigate();
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const unsubs: Array<Promise<() => void>> = [];
    unsubs.push(
      api.onOpenSettings(() => {
        if (isMountedRef.current) {
          navigate('/settings');
        }
      })
    );
    return () => {
      isMountedRef.current = false;
      cleanupUnsubscribers(unsubs, isMountedRef);
    };
  }, [navigate]);
  return null;
}

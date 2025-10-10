import { useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { ThemeProvider } from './components/Common/ThemeProvider';
import { Reminder } from './components/Reminder/Reminder';
import { Layout } from './components/Common/Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Analytics } from './pages/Analytics';
import { useAppStore } from './store';
import type { Settings as AppSettings, UpdateManifest } from './types';
import * as api from './utils/api';
import { changeLanguage } from './i18n';
import { isNewerVersion } from './utils/version';
import './App.css';
import './i18n';

/**
 * 根应用组件：负责初始化设置、监听 Tauri 后端事件，并配置全局路由/主题。
 */
function App() {
  const { i18n } = useTranslation();
  const { settings, timerInfo, setTimerInfo, setAppVersion, setUpdateManifest } = useAppStore();

  const isReminderWindow = (() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash.startsWith('reminder');
  })();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<string | null>(null);

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
      if (isReminderWindow) return;
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
    [isReminderWindow, stopRestMusic]
  );

  useEffect(() => {
    /**
     * 根据当前阶段控制提醒窗口（全屏或浮窗）。
     */
    // Helper to open/close reminder window based on phase
    const handleReminderForPhase = (phase: string, settingsOverride?: AppSettings) => {
      const activeSettings = settingsOverride ?? useAppStore.getState().settings;
      if (phase === 'break') {
        // In reminder window, don't attempt to open itself; focusing is fine but unnecessary
        if (!isReminderWindow) {
          api.openReminderWindow(activeSettings.reminderMode === 'fullscreen').catch((error) => {
            console.error('Failed to open reminder window:', error);
          });
        }
      } else {
        // Always allow closing from any window
        api.closeReminderWindow().catch((error) => {
          console.error('Failed to close reminder window:', error);
        });
      }

      if (!isReminderWindow) {
        if (phase === 'break') {
          void startRestMusic(activeSettings.restMusicEnabled, activeSettings.restMusicDirectory);
        } else {
          stopRestMusic();
        }
      }
    };

    // 初始化加载持久化设置，并同步语言环境
    api.loadSettings().then(async (loaded) => {
      useAppStore.getState().setSettings(loaded);
      // Apply language with proper resource loading
      const lang = loaded.language === 'en' ? 'en' : 'zh-CN';
      await changeLanguage(lang);

      // Sync autostart with persisted setting
      api.setAutostart(loaded.autostart).catch((error) => {
        console.error('Failed to sync autostart on init:', error);
      });
    }).catch((error) => {
      console.error('Failed to load settings:', error);
    });

    // Set up event listeners
    const unsubscribers: Array<Promise<() => void>> = [];

    // Listen for timer updates
    unsubscribers.push(
      api.onTimerUpdate((info) => {
        const store = useAppStore.getState();
        const previousPhase = store.timerInfo.phase;
        store.setTimerInfo(info);

        if (previousPhase !== info.phase) {
          handleReminderForPhase(info.phase, store.settings);
        }
      })
    );

    // Listen for phase changes
    unsubscribers.push(
      api.onPhaseChange((phase) => {
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
    if (isReminderWindow) {
      api.getTimerInfo().then(setTimerInfo).catch((error) => {
        console.error('Failed to load timer info:', error);
      });
    }

    // 清理事件监听，避免内存泄漏
    return () => {
      unsubscribers.forEach((p) => p.then((unsub) => unsub()));
      if (!isReminderWindow) {
        stopRestMusic();
      }
    };
  }, [isReminderWindow, setTimerInfo, startRestMusic, stopRestMusic]);

  // Update language when settings change
  useEffect(() => {
    const lang = settings.language === 'en' ? 'en' : 'zh-CN';
    if (i18n.language !== lang) {
      changeLanguage(lang).catch((error) => {
        console.error('Failed to change language:', error);
      });
    }
  }, [settings.language, i18n]);

  useEffect(() => {
    if (isReminderWindow) return;

    if (!settings.restMusicEnabled) {
      stopRestMusic();
      return;
    }

    if (timerInfo.phase === 'break') {
      void startRestMusic(settings.restMusicEnabled, settings.restMusicDirectory);
    }
  }, [
    isReminderWindow,
    settings.restMusicEnabled,
    settings.restMusicDirectory,
    timerInfo.phase,
    startRestMusic,
    stopRestMusic,
  ]);

  useEffect(() => {
    if (isReminderWindow) return;

    const checkForUpdates = async () => {
      try {
        const currentVersion = await getVersion();
        setAppVersion(currentVersion);

        const response = await fetch(
          'https://raw.githubusercontent.com/youtonghy/RESTY/refs/heads/main/latest.json',
          { cache: 'no-store' }
        );
        if (!response.ok) {
          return;
        }

        const manifest = (await response.json()) as UpdateManifest;
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
  }, [isReminderWindow, setAppVersion, setUpdateManifest]);

  return (
    <ThemeProvider>
      {isReminderWindow ? (
        <Reminder isFullscreen={settings.reminderMode === 'fullscreen'} />
      ) : (
        <BrowserRouter>
          {/* Bridge: listen to backend events and navigate */}
          <RouteEventBridge />
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/analytics" element={<Analytics />} />
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
  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [];
    unsubs.push(
      api.onOpenSettings(() => {
        navigate('/settings');
      })
    );
    return () => {
      unsubs.forEach((p) => p.then((unsub) => unsub()));
    };
  }, [navigate]);
  return null;
}

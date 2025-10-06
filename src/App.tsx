import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/Common/ThemeProvider';
import { Layout } from './components/Common/Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Analytics } from './pages/Analytics';
import { useAppStore } from './store';
import type { Settings as AppSettings } from './types';
import * as api from './utils/api';
import { changeLanguage } from './i18n';
import './App.css';
import './i18n';

/**
 * 根应用组件：负责初始化设置、监听 Tauri 后端事件，并配置全局路由/主题。
 */
function App() {
  const { i18n } = useTranslation();
  const { settings } = useAppStore();

  useEffect(() => {
    /**
     * 根据当前阶段控制提醒窗口（全屏或浮窗）。
     */
    // Helper to open/close reminder window based on phase
    const handleReminderForPhase = (phase: string, settingsOverride?: AppSettings) => {
      const activeSettings = settingsOverride ?? useAppStore.getState().settings;
      if (phase === 'break') {
        api.openReminderWindow(activeSettings.reminderMode === 'fullscreen').catch((error) => {
          console.error('Failed to open reminder window:', error);
        });
      } else {
        api.closeReminderWindow().catch((error) => {
          console.error('Failed to close reminder window:', error);
        });
      }
    };

    // 初始化加载持久化设置，并同步语言环境
    api.loadSettings().then(async (loaded) => {
      useAppStore.getState().setSettings(loaded);
      // Apply language with proper resource loading
      const lang = loaded.language === 'en' ? 'en' : 'zh-CN';
      await changeLanguage(lang);
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

    // 清理事件监听，避免内存泄漏
    return () => {
      unsubscribers.forEach((p) => p.then((unsub) => unsub()));
    };
  }, []);

  // Update language when settings change
  useEffect(() => {
    const lang = settings.language === 'en' ? 'en' : 'zh-CN';
    if (i18n.language !== lang) {
      changeLanguage(lang).catch((error) => {
        console.error('Failed to change language:', error);
      });
    }
  }, [settings.language, i18n]);

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

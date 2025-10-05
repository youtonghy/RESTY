import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './components/Common/ThemeProvider';
import { Layout } from './components/Common/Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Analytics } from './pages/Analytics';
import { Reminder } from './components/Reminder/Reminder';
import { useAppStore } from './store';
import * as api from './utils/api';
import './App.css';
import './i18n';

function App() {
  const { i18n } = useTranslation();
  const { settings, setTimerInfo, isReminderWindowOpen } = useAppStore();

  useEffect(() => {
    // Load initial settings
    api.loadSettings().then((loaded) => {
      useAppStore.getState().setSettings(loaded);
      // Apply language
      i18n.changeLanguage(loaded.language === 'en' ? 'en' : 'zh-CN');
    });

    // Set up event listeners
    const unsubscribers: Array<Promise<() => void>> = [];

    // Listen for timer updates
    unsubscribers.push(
      api.onTimerUpdate((info) => {
        setTimerInfo(info);
      })
    );

    // Listen for phase changes
    unsubscribers.push(
      api.onPhaseChange((phase) => {
        console.log('Phase changed to:', phase);
      })
    );

    // Listen for timer finished
    unsubscribers.push(
      api.onTimerFinished(() => {
        console.log('Timer finished');
        useAppStore.getState().setReminderWindowOpen(true);
      })
    );

    // Cleanup
    return () => {
      unsubscribers.forEach((p) => p.then((unsub) => unsub()));
    };
  }, []);

  // Update language when settings change
  useEffect(() => {
    const lang = settings.language === 'en' ? 'en' : 'zh-CN';
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [settings.language, i18n]);

  return (
    <ThemeProvider>
      <BrowserRouter>
        {isReminderWindowOpen && (
          <Reminder isFullscreen={settings.reminderMode === 'fullscreen'} />
        )}
        <Layout showNavigation={!isReminderWindowOpen}>
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

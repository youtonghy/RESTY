import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAppStore } from '../../store';
import type { Theme } from '../../types';
import { updateTrayIconTheme } from '../../utils/tray';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * 基于设置与系统偏好控制主题，并在 DOM 上设置 `data-theme`。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { settings, setSettings } = useAppStore();
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const updateTheme = () => {
      let theme: 'light' | 'dark' = 'light';

      if (settings.theme === 'auto') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        theme = settings.theme;
      }

      setEffectiveTheme(theme);
      document.documentElement.setAttribute('data-theme', theme);
    };

    updateTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (settings.theme === 'auto') {
        updateTheme();
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [settings.theme]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as { __TAURI__?: unknown }).__TAURI__) {
      void updateTrayIconTheme(effectiveTheme);
    }
  }, [effectiveTheme]);

  const setTheme = (theme: Theme) => {
    setSettings({ theme });
  };

  return (
    <ThemeContext.Provider value={{ theme: settings.theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * 暴露上下文 hook，确保只在 ThemeProvider 内部使用。
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

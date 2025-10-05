import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAppStore } from '../../store';
import type { Theme } from '../../types';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

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

  const setTheme = (theme: Theme) => {
    setSettings({ theme });
  };

  return (
    <ThemeContext.Provider value={{ theme: settings.theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}

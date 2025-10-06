import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store';
import { Theme } from '../../types';

type ThemeOption = 'light' | 'dark' | 'system';

export function ThemeToggle() {
  const { settings, setSettings } = useAppStore();
  const [currentTheme, setCurrentTheme] = useState<ThemeOption>('system');

  useEffect(() => {
    // Initialize theme from settings
    if (settings.theme === 'auto') {
      setCurrentTheme('system');
    } else {
      setCurrentTheme(settings.theme);
    }

    // Apply theme
    applyTheme(settings.theme);
  }, [settings.theme]);

  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;

    if (theme === 'auto') {
      // Check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  };

  const handleThemeChange = (theme: ThemeOption) => {
    setCurrentTheme(theme);

    const themeValue: Theme = theme === 'system' ? 'auto' : theme;
    setSettings({ theme: themeValue });
    applyTheme(themeValue);
  };

  const getThemeIcon = (theme: ThemeOption) => {
    switch (theme) {
      case 'light':
        return '☀️';
      case 'dark':
        return '🌙';
      case 'system':
        return '🖥️';
      default:
        return '🖥️';
    }
  };

  const getThemeLabel = (theme: ThemeOption) => {
    switch (theme) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
      default:
        return 'System';
    }
  };

  return (
    <div className="theme-toggle">
      <div className="theme-toggle-btn" role="group" aria-label="Theme selection">
        {(['light', 'dark', 'system'] as ThemeOption[]).map((theme) => (
          <button
            key={theme}
            className={`theme-option ${currentTheme === theme ? 'active' : ''}`}
            onClick={() => handleThemeChange(theme)}
            aria-pressed={currentTheme === theme}
            aria-label={`Switch to ${getThemeLabel(theme)} theme`}
            title={`Switch to ${getThemeLabel(theme)} theme`}
          >
            <span className="theme-icon">{getThemeIcon(theme)}</span>
            <span className="theme-label">{getThemeLabel(theme)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
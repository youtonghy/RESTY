import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import type { Language, Settings as SettingsType } from '../types';
import './Settings.css';

const enforceTrayDefaults = (settings: SettingsType): SettingsType => {
  const normalized: SettingsType = {
    ...settings,
    minimizeToTray: true,
    closeToTray: true,
    silentAutostart: settings.silentAutostart ?? false,
  };
  if (!normalized.autostart) {
    normalized.silentAutostart = false;
  }
  return normalized;
};

const LANGUAGE_OPTIONS: Array<{ value: Language; labelKey: string }> = [
  { value: 'en-US', labelKey: 'settings.language.options.enUS' },
  { value: 'en-GB', labelKey: 'settings.language.options.enGB' },
  { value: 'zh-CN', labelKey: 'settings.language.options.zhCN' },
  { value: 'zh-TW', labelKey: 'settings.language.options.zhTW' },
];

/**
 * 设置页面：负责从后端加载配置、提供表单编辑与导入导出能力。
 */
export function Settings() {
  const { t } = useTranslation();
  const { settings, setSettings, appVersion } = useAppStore();
  const [localSettings, setLocalSettings] = useState<SettingsType>(enforceTrayDefaults(settings));
  const [message, setMessage] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const sectionDefs = useMemo(
    () => [
      { id: 'timer', label: t('settings.timer.title') },
      { id: 'reminder', label: t('settings.reminder.title') },
      { id: 'appearance', label: t('settings.appearance.title') },
      { id: 'system', label: t('settings.system.title') },
      { id: 'language', label: t('settings.language.title') },
      { id: 'about', label: t('settings.about.title') },
    ],
    [t]
  );
  const [activeSection, setActiveSection] = useState(sectionDefs[0]?.id ?? 'timer');

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      let current = sectionDefs[0]?.id ?? 'timer';
      const offset = 160;
      sectionDefs.forEach((section) => {
        const node = sectionRefs.current[section.id];
        if (!node) return;
        const top = node.getBoundingClientRect().top;
        if (top - offset <= 0) {
          current = section.id;
        }
      });
      setActiveSection((prev) => (prev === current ? prev : current));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [sectionDefs]);

  /** 从后端加载配置并同步全局 store。 */
  const loadSettings = useCallback(async () => {
    try {
      const loaded = await api.loadSettings();
      if (!isMountedRef.current) return;
      const normalized = enforceTrayDefaults(loaded);
      setSettings(normalized);
      setLocalSettings(normalized);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [setSettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  /** 自动保存：将传入的新设置保存到后端并同步全局状态。 */
  const saveSettingsAuto = useCallback(
    async (next: SettingsType) => {
      if (!isMountedRef.current) return;
      setMessage('');
      try {
        const normalized = enforceTrayDefaults(next);
        await api.saveSettings(normalized);
        if (!isMountedRef.current) return;
        setSettings(normalized);
        setLocalSettings(normalized);

        // 同步系统开机自启状态
        api.setAutostart(normalized.autostart).catch((err) => {
          console.error('Failed to sync autostart:', err);
        });

        if (toastTimer.current) {
          clearTimeout(toastTimer.current);
        }
        setShowSuccessToast(true);
        toastTimer.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setShowSuccessToast(false);
          toastTimer.current = null;
        }, 2200);
      } catch (error) {
        console.error('Failed to save settings:', error);
        if (!isMountedRef.current) return;
        setMessage(t('errors.saveFailed'));
      }
    },
    [setSettings, t]
  );

  /** 恢复为上次保存的设置。 */
  const handleReset = useCallback(() => {
    if (confirm(t('settings.actions.reset'))) {
      setLocalSettings(enforceTrayDefaults(settings));
    }
  }, [settings, t]);

  const handleOpenMusicDirectory = useCallback(async () => {
    const directory = localSettings.restMusicDirectory;
    if (!directory) return;
    try {
      await revealItemInDir(directory);
    } catch (error) {
      console.error('Failed to open music directory:', error);
      if (!isMountedRef.current) return;
      setMessage(t('settings.reminder.restMusic.openFailed'));
    }
  }, [localSettings.restMusicDirectory, t]);

  const handleOpenWebsite = useCallback(async () => {
    try {
      await openUrl('https://resty.tokisantike.net');
    } catch (error) {
      console.error('Failed to open RESTY website:', error);
      if (typeof window !== 'undefined') {
        window.open('https://resty.tokisantike.net', '_blank', 'noopener,noreferrer');
      }
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    const node = sectionRefs.current[id];
    if (!node) return;
    setActiveSection(id);
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // 已移除导入/导出：改为实时自动保存

  return (
    <div className="page">
      {showSuccessToast && (
        <div className="settings-toast" role="status" aria-live="polite">
          {t('notifications.settingsSaved')}
        </div>
      )}
      <div className="container settings-container">
        <h1 className="page-title">{t('settings.title')}</h1>

        <div className="settings-layout">
          <nav
            className="settings-nav"
            aria-label={t('settings.navigation.label', { defaultValue: 'Settings sections' })}
          >
            {sectionDefs.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-button settings-nav-button--${section.id}${
                  activeSection === section.id ? ' is-active' : ''
                }`}
                onClick={() => scrollToSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {/* Timer Settings */}
            <section
              id="settings-timer"
              ref={(node) => {
                sectionRefs.current.timer = node;
              }}
              className="settings-card settings-section"
            >
              <h2 className="card-header">{t('settings.timer.title')}</h2>

              <div className="form-group">
                <label htmlFor="workDuration">{t('settings.timer.workDuration')}</label>
                <input
                  id="workDuration"
                  type="number"
                  className="input"
                  value={localSettings.workDuration}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setLocalSettings({ ...localSettings, workDuration: value });
                  }}
                  onBlur={(e) => {
                    let value = parseInt(e.target.value);
                    if (Number.isNaN(value)) value = localSettings.workDuration;
                    value = Math.max(1, Math.min(120, value));
                    const next = { ...localSettings, workDuration: value };
                    setLocalSettings(next);
                    saveSettingsAuto(next);
                  }}
                  min={1}
                  max={120}
                />
              </div>

              <div className="form-group">
                <label htmlFor="breakDuration">{t('settings.timer.breakDuration')}</label>
                <input
                  id="breakDuration"
                  type="number"
                  className="input"
                  value={localSettings.breakDuration}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setLocalSettings({ ...localSettings, breakDuration: value });
                  }}
                  onBlur={(e) => {
                    let value = parseInt(e.target.value);
                    if (Number.isNaN(value)) value = localSettings.breakDuration;
                    value = Math.max(1, Math.min(120, value));
                    const next = { ...localSettings, breakDuration: value };
                    setLocalSettings(next);
                    saveSettingsAuto(next);
                  }}
                  min={1}
                  max={120}
                />
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-row">
                  <span className="toggle-text">{t('settings.timer.enableForceBreak')}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={localSettings.enableForceBreak}
                      onChange={(e) => {
                        const next = { ...localSettings, enableForceBreak: e.target.checked };
                        setLocalSettings(next);
                        saveSettingsAuto(next);
                      }}
                    />
                    <span className="slider" />
                  </span>
                </label>
                <p className="helper-text">{t('settings.timer.forceBreakDescription')}</p>
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-row">
                  <span className="toggle-text">{t('settings.timer.flowMode')}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={localSettings.flowModeEnabled}
                      onChange={(e) => {
                        const next = { ...localSettings, flowModeEnabled: e.target.checked };
                        setLocalSettings(next);
                        saveSettingsAuto(next);
                      }}
                    />
                    <span className="slider" />
                  </span>
                </label>
                <p className="helper-text">{t('settings.timer.flowModeDescription')}</p>
              </div>
            </section>

            {/* Reminder Settings */}
            <section
              id="settings-reminder"
              ref={(node) => {
                sectionRefs.current.reminder = node;
              }}
              className="settings-card settings-section"
            >
              <h2 className="card-header">{t('settings.reminder.title')}</h2>

              <div className="form-group">
                <label htmlFor="reminderMode">{t('settings.reminder.mode')}</label>
                <select
                  id="reminderMode"
                  className="input"
                  value={localSettings.reminderMode}
                  onChange={(e) => {
                    const next = {
                      ...localSettings,
                      reminderMode: e.target.value as 'fullscreen' | 'floating',
                    } as SettingsType;
                    setLocalSettings(next);
                    saveSettingsAuto(next);
                  }}
                >
                  <option value="fullscreen">{t('settings.reminder.fullscreen')}</option>
                  <option value="floating">{t('settings.reminder.floating')}</option>
                </select>
              </div>

              <h3 className="card-subtitle">{t('settings.reminder.restMusic.title')}</h3>

              <div className="form-group toggle-group">
                <label className="toggle-row">
                  <span className="toggle-text">{t('settings.reminder.restMusic.enable')}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={localSettings.restMusicEnabled}
                      onChange={(e) => {
                        const next = { ...localSettings, restMusicEnabled: e.target.checked };
                        setLocalSettings(next);
                        saveSettingsAuto(next);
                      }}
                    />
                    <span className="slider" />
                  </span>
                </label>
                <p className="helper-text">{t('settings.reminder.restMusic.description')}</p>
              </div>

              <div className="form-group">
                <label>{t('settings.reminder.restMusic.directory')}</label>
                <button
                  type="button"
                  className="link-button directory-display"
                  onClick={handleOpenMusicDirectory}
                  disabled={!localSettings.restMusicDirectory}
                >
                  {localSettings.restMusicDirectory || t('settings.reminder.restMusic.directoryMissing')}
                </button>
              </div>
            </section>

            {/* Appearance Settings */}
            <section
              id="settings-appearance"
              ref={(node) => {
                sectionRefs.current.appearance = node;
              }}
              className="settings-card settings-section"
            >
              <h2 className="card-header">{t('settings.appearance.title')}</h2>

              <div className="form-group">
                <label htmlFor="theme">{t('settings.appearance.theme')}</label>
                <select
                  id="theme"
                  className="input"
                  value={localSettings.theme}
                  onChange={(e) => {
                    const next = {
                      ...localSettings,
                      theme: e.target.value as 'light' | 'dark' | 'auto',
                    } as SettingsType;
                    setLocalSettings(next);
                    saveSettingsAuto(next);
                  }}
                >
                  <option value="light">{t('settings.appearance.light')}</option>
                  <option value="dark">{t('settings.appearance.dark')}</option>
                  <option value="auto">{t('settings.appearance.auto')}</option>
                </select>
              </div>
            </section>

            {/* System Settings */}
            <section
              id="settings-system"
              ref={(node) => {
                sectionRefs.current.system = node;
              }}
              className="settings-card settings-section"
            >
              <h2 className="card-header">{t('settings.system.title')}</h2>

              <div className="form-group toggle-group">
                <label className="toggle-row">
                  <span className="toggle-text">{t('settings.system.autostart')}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={localSettings.autostart}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        const next = {
                          ...localSettings,
                          autostart: enabled,
                          silentAutostart: enabled ? localSettings.silentAutostart : false,
                        };
                        setLocalSettings(next);
                        saveSettingsAuto(next);
                      }}
                    />
                    <span className="slider" />
                  </span>
                </label>
              </div>

              <div className="form-group toggle-group">
                <label className="toggle-row">
                  <span className="toggle-text">{t('settings.system.silentAutostart')}</span>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={localSettings.silentAutostart}
                      disabled={!localSettings.autostart}
                      onChange={(e) => {
                        const next = {
                          ...localSettings,
                          silentAutostart: e.target.checked,
                        };
                        setLocalSettings(next);
                        saveSettingsAuto(next);
                      }}
                    />
                    <span className="slider" />
                  </span>
                </label>
                <p className="helper-text">{t('settings.system.silentAutostartHint')}</p>
              </div>
            </section>

            {/* Language Settings */}
            <section
              id="settings-language"
              ref={(node) => {
                sectionRefs.current.language = node;
              }}
              className="settings-card settings-section"
            >
              <h2 className="card-header">{t('settings.language.title')}</h2>

              <div className="form-group">
                <label htmlFor="language">{t('settings.language.select')}</label>
                <select
                  id="language"
                  className="input"
                  value={localSettings.language}
                  onChange={(e) => {
                    const newLang = e.target.value as Language;
                    const next = { ...localSettings, language: newLang } as SettingsType;
                    setLocalSettings(next);
                    saveSettingsAuto(next);
                  }}
                >
                  {LANGUAGE_OPTIONS.map(({ value, labelKey }) => (
                    <option key={value} value={value}>
                      {t(labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </section>

            {/* About */}
            <section
              id="settings-about"
              ref={(node) => {
                sectionRefs.current.about = node;
              }}
              className="settings-card settings-section"
            >
              <h2 className="card-header">{t('settings.about.title')}</h2>
              <dl className="about-list">
                <div className="about-item">
                  <dt className="about-label">{t('settings.about.software')}</dt>
                  <dd className="about-value">{t('app.name')}</dd>
                </div>
                <div className="about-item">
                  <dt className="about-label">{t('settings.about.author')}</dt>
                  <dd className="about-value">youtonghy</dd>
                </div>
                <div className="about-item">
                  <dt className="about-label">{t('settings.about.website')}</dt>
                  <dd className="about-value">
                    <button type="button" className="link-button" onClick={handleOpenWebsite}>
                      https://resty.tokisantike.net
                    </button>
                  </dd>
                </div>
                <div className="about-item">
                  <dt className="about-label">{t('settings.about.version')}</dt>
                  <dd className="about-value">
                    {appVersion ?? t('settings.about.versionUnknown')}
                  </dd>
                </div>
              </dl>
            </section>

            {/* Actions: 仅保留重置，移除手动保存/导出/导入 */}
            <div className="settings-actions">
              <button className="btn btn-secondary" onClick={handleReset}>
                {t('settings.actions.reset')}
              </button>
            </div>

            {message && <div className="message">{message}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

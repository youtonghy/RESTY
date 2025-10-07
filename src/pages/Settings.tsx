import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import * as api from '../utils/api';
import type { Settings as SettingsType } from '../types';
import './Settings.css';

/**
 * 设置页面：负责从后端加载配置、提供表单编辑与导入导出能力。
 */
export function Settings() {
  const { t } = useTranslation();
  const { settings, setSettings } = useAppStore();
  const [localSettings, setLocalSettings] = useState<SettingsType>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  /** 从后端加载配置并同步全局 store。 */
  const loadSettings = async () => {
    try {
      const loaded = await api.loadSettings();
      setSettings(loaded);
      setLocalSettings(loaded);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  /** 保存表单内容到后端，同时刷新全局状态。 */
  const handleSave = async () => {
    setIsSaving(true);
    setMessage('');
    try {
      await api.saveSettings(localSettings);
      setSettings(localSettings);

      setMessage(t('notifications.settingsSaved'));
    } catch (error) {
      setMessage(t('errors.saveFailed'));
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  /** 恢复为上次保存的设置。 */
  const handleReset = () => {
    if (confirm(t('settings.actions.reset'))) {
      setLocalSettings(settings);
    }
  };

  /** 导出当前配置为 JSON 文件。 */
  const handleExport = async () => {
    try {
      const jsonStr = await api.exportConfig();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resty-config-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(t('notifications.configExported'));
    } catch (error) {
      setMessage(t('errors.exportFailed'));
    }
  };

  /** 触发文件选择并导入 JSON 配置。 */
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const imported = await api.importConfig(text);
          setSettings(imported);
          setLocalSettings(imported);
          setMessage(t('notifications.configImported'));
        } catch (error) {
          setMessage(t('errors.importFailed'));
        }
      }
    };
    input.click();
  };

  return (
    <div className="page">
      <div className="container">
        <h1 className="page-title">{t('settings.title')}</h1>

        {/* Timer Settings */}
        <section className="card settings-section">
          <h2 className="card-header">{t('settings.timer.title')}</h2>

          <div className="form-group">
            <label htmlFor="workDuration">{t('settings.timer.workDuration')}</label>
            <input
              id="workDuration"
              type="number"
              className="input"
              value={localSettings.workDuration}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, workDuration: parseInt(e.target.value) })
              }
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
              onChange={(e) =>
                setLocalSettings({ ...localSettings, breakDuration: parseInt(e.target.value) })
              }
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
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, enableForceBreak: e.target.checked })
                  }
                />
                <span className="slider" />
              </span>
            </label>
            <p className="helper-text">{t('settings.timer.forceBreakDescription')}</p>
          </div>
        </section>

        {/* Reminder Settings */}
        <section className="card settings-section">
          <h2 className="card-header">{t('settings.reminder.title')}</h2>

          <div className="form-group">
            <label htmlFor="reminderMode">{t('settings.reminder.mode')}</label>
            <select
              id="reminderMode"
              className="input"
              value={localSettings.reminderMode}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  reminderMode: e.target.value as 'fullscreen' | 'floating',
                })
              }
            >
              <option value="fullscreen">{t('settings.reminder.fullscreen')}</option>
              <option value="floating">{t('settings.reminder.floating')}</option>
            </select>
          </div>

  
          <div className="form-group toggle-group">
            <label className="toggle-row">
              <span className="toggle-text">{t('settings.reminder.playSound')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.playSound}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, playSound: e.target.checked })
                  }
                />
                <span className="slider" />
              </span>
            </label>
          </div>
        </section>

        {/* Appearance Settings */}
        <section className="card settings-section">
          <h2 className="card-header">{t('settings.appearance.title')}</h2>

          <div className="form-group">
            <label htmlFor="theme">{t('settings.appearance.theme')}</label>
            <select
              id="theme"
              className="input"
              value={localSettings.theme}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  theme: e.target.value as 'light' | 'dark' | 'auto',
                })
              }
            >
              <option value="light">{t('settings.appearance.light')}</option>
              <option value="dark">{t('settings.appearance.dark')}</option>
              <option value="auto">{t('settings.appearance.auto')}</option>
            </select>
          </div>
        </section>

        {/* System Settings */}
        <section className="card settings-section">
          <h2 className="card-header">{t('settings.system.title')}</h2>

          <div className="form-group toggle-group">
            <label className="toggle-row">
              <span className="toggle-text">{t('settings.system.autostart')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.autostart}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, autostart: e.target.checked })
                  }
                />
                <span className="slider" />
              </span>
            </label>
          </div>

          <div className="form-group toggle-group">
            <label className="toggle-row">
              <span className="toggle-text">{t('settings.system.minimizeToTray')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.minimizeToTray}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, minimizeToTray: e.target.checked })
                  }
                />
                <span className="slider" />
              </span>
            </label>
          </div>

          <div className="form-group toggle-group">
            <label className="toggle-row">
              <span className="toggle-text">{t('settings.system.closeToTray')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.closeToTray}
                  onChange={(e) =>
                    setLocalSettings({ ...localSettings, closeToTray: e.target.checked })
                  }
                />
                <span className="slider" />
              </span>
            </label>
          </div>
        </section>

        {/* Language Settings */}
        <section className="card settings-section">
          <h2 className="card-header">{t('settings.language.title')}</h2>

          <div className="form-group">
            <label htmlFor="language">{t('settings.language.select')}</label>
            <select
              id="language"
              className="input"
              value={localSettings.language}
              onChange={(e) => {
                const newLang = e.target.value as 'en' | 'zh-CN';
                setLocalSettings({ ...localSettings, language: newLang });
              }}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </div>
        </section>

        {/* Actions */}
        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : t('settings.actions.save')}
          </button>
          <button className="btn btn-secondary" onClick={handleReset}>
            {t('settings.actions.reset')}
          </button>
          <button className="btn btn-secondary" onClick={handleExport}>
            {t('settings.actions.export')}
          </button>
          <button className="btn btn-secondary" onClick={handleImport}>
            {t('settings.actions.import')}
          </button>
        </div>

        {message && <div className="message">{message}</div>}
      </div>
    </div>
  );
}

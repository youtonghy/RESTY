import { useEffect, useState } from 'react';
import { open } from '@tauri-apps/plugin-opener';
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

  /** 自动保存：将传入的新设置保存到后端并同步全局状态。 */
  const saveSettingsAuto = async (next: SettingsType) => {
    setMessage('');
    try {
      await api.saveSettings(next);
      setSettings(next);
      setLocalSettings(next);

      // 同步系统开机自启状态
      api.setAutostart(next.autostart).catch((err) => {
        console.error('Failed to sync autostart:', err);
      });

      setMessage(t('notifications.settingsSaved'));
    } catch (error) {
      setMessage(t('errors.saveFailed'));
      console.error('Failed to save settings:', error);
    }
  };

  /** 恢复为上次保存的设置。 */
  const handleReset = () => {
    if (confirm(t('settings.actions.reset'))) {
      setLocalSettings(settings);
    }
  };

  const handleOpenMusicDirectory = async () => {
    if (!localSettings.restMusicDirectory) return;
    try {
      await open(localSettings.restMusicDirectory);
    } catch (error) {
      console.error('Failed to open music directory:', error);
      setMessage(t('settings.reminder.restMusic.openFailed'));
    }
  };

  // 已移除导入/导出：改为实时自动保存

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
        <section className="card settings-section">
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
        <section className="card settings-section">
          <h2 className="card-header">{t('settings.system.title')}</h2>

          <div className="form-group toggle-group">
            <label className="toggle-row">
              <span className="toggle-text">{t('settings.system.autostart')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.autostart}
                  onChange={(e) => {
                    const next = { ...localSettings, autostart: e.target.checked };
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
              <span className="toggle-text">{t('settings.system.minimizeToTray')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.minimizeToTray}
                  onChange={(e) => {
                    const next = { ...localSettings, minimizeToTray: e.target.checked };
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
              <span className="toggle-text">{t('settings.system.closeToTray')}</span>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={localSettings.closeToTray}
                  onChange={(e) => {
                    const next = { ...localSettings, closeToTray: e.target.checked };
                    setLocalSettings(next);
                    saveSettingsAuto(next);
                  }}
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
                const next = { ...localSettings, language: newLang } as SettingsType;
                setLocalSettings(next);
                saveSettingsAuto(next);
              }}
            >
              <option value="en">English</option>
              <option value="zh-CN">简体中文</option>
            </select>
          </div>
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
  );
}

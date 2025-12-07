import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './TrayMenu.css';

interface TrayMenuProps {
  onClose?: () => void;
}

/**
 * 自定义托盘右键菜单组件
 * 支持圆角和鼠标悬停效果
 */
export function TrayMenu({ onClose }: TrayMenuProps) {
  const { t } = useTranslation();
  const [showNoBreakSubmenu, setShowNoBreakSubmenu] = useState(false);

  const closeMenu = useCallback(async () => {
    onClose?.();
    try {
      await getCurrentWindow().hide();
    } catch (error) {
      console.error('Failed to hide tray menu:', error);
    }
  }, [onClose]);

  const handleSkip = useCallback(async () => {
    try {
      await invoke('tray_menu_action', { action: 'skip' });
    } catch (error) {
      console.error('Failed to skip:', error);
    }
    await closeMenu();
  }, [closeMenu]);

  const handleNoBreak = useCallback(async (hours: string) => {
    try {
      await invoke('tray_menu_action', { action: `no_break_${hours}` });
    } catch (error) {
      console.error('Failed to set no break:', error);
    }
    await closeMenu();
  }, [closeMenu]);

  const handleSettings = useCallback(async () => {
    try {
      await invoke('tray_menu_action', { action: 'settings' });
    } catch (error) {
      console.error('Failed to open settings:', error);
    }
    await closeMenu();
  }, [closeMenu]);

  const handleQuit = useCallback(async () => {
    try {
      await invoke('tray_menu_action', { action: 'quit' });
    } catch (error) {
      console.error('Failed to quit:', error);
    }
  }, []);

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void closeMenu();
      }
    };

    const handleBlur = () => {
      // Small delay to allow click events to process first
      setTimeout(() => {
        void closeMenu();
      }, 100);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
    };
  }, [closeMenu]);

  return (
    <div className="tray-menu">
      <button
        type="button"
        className="tray-menu-item"
        onClick={handleSkip}
      >
        <span className="tray-menu-icon">⏭</span>
        <span className="tray-menu-text">{t('tray.skip', '跳到下一次休息/工作')}</span>
      </button>

      <div
        className="tray-menu-item tray-menu-submenu-trigger"
        onMouseEnter={() => setShowNoBreakSubmenu(true)}
        onMouseLeave={() => setShowNoBreakSubmenu(false)}
      >
        <span className="tray-menu-icon">🚫</span>
        <span className="tray-menu-text">{t('tray.noBreak', 'X 小时不休息')}</span>
        <span className="tray-menu-arrow">›</span>

        {showNoBreakSubmenu && (
          <div className="tray-menu-submenu">
            <button
              type="button"
              className="tray-menu-item"
              onClick={() => handleNoBreak('1h')}
            >
              <span className="tray-menu-text">{t('tray.noBreak1h', '1 小时不休息')}</span>
            </button>
            <button
              type="button"
              className="tray-menu-item"
              onClick={() => handleNoBreak('2h')}
            >
              <span className="tray-menu-text">{t('tray.noBreak2h', '2 小时不休息')}</span>
            </button>
            <button
              type="button"
              className="tray-menu-item"
              onClick={() => handleNoBreak('5h')}
            >
              <span className="tray-menu-text">{t('tray.noBreak5h', '5 小时不休息')}</span>
            </button>
            <button
              type="button"
              className="tray-menu-item"
              onClick={() => handleNoBreak('tomorrow')}
            >
              <span className="tray-menu-text">{t('tray.noBreakTomorrow', '直到明天早晨不休息')}</span>
            </button>
          </div>
        )}
      </div>

      <div className="tray-menu-divider" />

      <button
        type="button"
        className="tray-menu-item"
        onClick={handleSettings}
      >
        <span className="tray-menu-icon">⚙</span>
        <span className="tray-menu-text">{t('tray.settings', '设置')}</span>
      </button>

      <button
        type="button"
        className="tray-menu-item tray-menu-item--danger"
        onClick={handleQuit}
      >
        <span className="tray-menu-icon">✕</span>
        <span className="tray-menu-text">{t('tray.quit', '关闭')}</span>
      </button>
    </div>
  );
}

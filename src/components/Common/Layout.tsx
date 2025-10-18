import { ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAppStore } from '../../store';
import { Navigation } from './Navigation';
import { useTheme } from './ThemeProvider';
import iconLight from '../../../src-tauri/icons/128x128.png';
import iconDark from '../../../src-tauri/icons/128x128Night.png';
import { WindowControls } from './WindowControls';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
  showNavigation?: boolean;
}

/**
 * 应用外壳，负责组合导航与主内容区域。
 */
export function Layout({ children, showNavigation = true }: LayoutProps) {
  const { t } = useTranslation();
  const { updateManifest, appVersion, setUpdateManifest } = useAppStore();
  const { effectiveTheme } = useTheme();

  const handleOpenWebsite = useCallback(async () => {
    if (!updateManifest) return;
    const target = updateManifest.downloadUrl || updateManifest.website;
    if (!target) return;
    try {
      await openUrl(target);
    } catch (error) {
      console.error('Failed to open update page:', error);
      if (typeof window !== 'undefined') {
        window.open(target, '_blank', 'noopener,noreferrer');
      }
    }
  }, [updateManifest]);

  const handleDismiss = useCallback(() => {
    setUpdateManifest(null);
  }, [setUpdateManifest]);

  return (
    <div className="layout">
      {/* Draggable area for borderless window with overlay buttons */}
      <div className="app-titlebar" data-tauri-drag-region>
        <div className="titlebar-left">
          <img
            className="app-logo"
            src={effectiveTheme === 'dark' ? iconDark : iconLight}
            alt="RESTY logo"
            aria-hidden="true"
          />
          <div className="app-title-group">
            <span className="app-title" title="RESTY">RESTY</span>
            <span className="app-subtitle">Eye Care Reminder</span>
          </div>
        </div>
        <WindowControls />
      </div>
      {updateManifest && (
        <div className="update-banner" role="status" aria-live="polite">
          <div className="update-banner__content">
            <span className="update-banner__title">
              {t('updates.available', { version: updateManifest.version })}
            </span>
            {appVersion && (
              <span className="update-banner__current">
                {t('updates.current', { version: appVersion })}
              </span>
            )}
          </div>
          <div className="update-banner__actions">
            <button type="button" className="update-banner__button" onClick={handleOpenWebsite}>
              {t('updates.view')}
            </button>
            <button
              type="button"
              className="update-banner__button update-banner__button--ghost"
              onClick={handleDismiss}
            >
              {t('updates.dismiss')}
            </button>
          </div>
        </div>
      )}
      <div className="layout-content">
        {showNavigation && <Navigation />}
        <main className="layout-main">{children}</main>
      </div>
    </div>
  );
}

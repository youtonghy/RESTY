import { ReactNode } from 'react';
import { Navigation } from './Navigation';
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
  return (
    <div className="layout">
      {/* Draggable area for borderless window with overlay title bar */}
      <div className="app-titlebar" data-tauri-drag-region>
        <div className="titlebar-left">
          {/* You can place app name or breadcrumbs here if desired */}
        </div>
        <WindowControls />
      </div>
      <div className="layout-content">
        {showNavigation && <Navigation />}
        <main className="layout-main">{children}</main>
      </div>
    </div>
  );
}

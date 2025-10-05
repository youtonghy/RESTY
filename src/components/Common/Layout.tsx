import { ReactNode } from 'react';
import { Navigation } from './Navigation';
import './Layout.css';

interface LayoutProps {
  children: ReactNode;
  showNavigation?: boolean;
}

export function Layout({ children, showNavigation = true }: LayoutProps) {
  return (
    <div className="layout">
      <div className="layout-content">
        {showNavigation && <Navigation />}
        <main className="layout-main">{children}</main>
      </div>
    </div>
  );
}

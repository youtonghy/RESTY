import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Navigation.css';

/**
 * 主导航组件：根据当前路由高亮菜单，并提供多语言标签。
 */
export function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navigation">
      <Link
        to="/"
        className={`nav-item ${isActive('/') ? 'active' : ''}`}
      >
        <span className="nav-icon">🏠</span>
        <span className="nav-label">Home</span>
      </Link>

      <Link
        to="/analytics"
        className={`nav-item ${isActive('/analytics') ? 'active' : ''}`}
      >
        <span className="nav-icon">📊</span>
        <span className="nav-label">{t('tray.analytics')}</span>
      </Link>

      <Link
        to="/settings"
        className={`nav-item ${isActive('/settings') ? 'active' : ''}`}
      >
        <span className="nav-icon">⚙️</span>
        <span className="nav-label">{t('tray.settings')}</span>
      </Link>
    </nav>
  );
}

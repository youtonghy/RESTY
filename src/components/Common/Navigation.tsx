import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Navigation.css';

interface IconProps {
  className?: string;
}

const DashboardIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={1.5}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 7.01L12.01 6.99889" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16 9.01L16.01 8.99889" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 9.01L8.01 8.99889" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 13.01L18.01 12.9989" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 13.01L6.01 12.9989" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 17.01L17.01 16.9989" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 17.01L7.01 16.9989" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 17L13 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M8.5 20.001H4C2.74418 18.3295 2 16.2516 2 14C2 8.47715 6.47715 4 12 4C17.5228 4 22 8.47715 22 14C22 16.2516 21.2558 18.3295 20 20.001L15.5 20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 23C13.6569 23 15 21.6569 15 20C15 18.3431 13.6569 17 12 17C10.3431 17 9 18.3431 9 20C9 21.6569 10.3431 23 12 23Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AnalyticsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={1.5}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M8.5 4H6C4.89543 4 4 4.89543 4 6V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V6C20 4.89543 19.1046 4 18 4H15.5"
      stroke="currentColor"
      strokeLinecap="round"
    />
    <path
      d="M8 6.4V4.5C8 4.22386 8.22386 4 8.5 4C8.77614 4 9.00422 3.77604 9.05152 3.50398C9.19968 2.65171 9.77399 1 12 1C14.226 1 14.8003 2.65171 14.9485 3.50398C14.9958 3.77604 15.2239 4 15.5 4C15.7761 4 16 4.22386 16 4.5V6.4C16 6.73137 15.7314 7 15.4 7H8.6C8.26863 7 8 6.73137 8 6.4Z"
      stroke="currentColor"
      strokeLinecap="round"
    />
  </svg>
);

const DailyReportIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="32"
    height="32"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    color="currentColor"
  >
    <path
      d="M10 9H6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.5 11C14.1193 11 13 9.88071 13 8.5C13 7.11929 14.1193 6 15.5 6C16.8807 6 18 7.11929 18 8.5C18 9.88071 16.8807 11 15.5 11Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M6 6H9"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 18L13.5 15L11 17L6 13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 20.4V3.6C3 3.26863 3.26863 3 3.6 3H20.4C20.7314 3 21 3.26863 21 3.6V20.4C21 20.7314 20.7314 21 20.4 21H3.6C3.26863 21 3 20.7314 3 20.4Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

const SettingsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={1.5}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M19.6224 10.3954L18.5247 7.7448L20 6L18 4L16.2647 5.48295L13.5578 4.36974L12.9353 2H10.981L10.3491 4.40113L7.70441 5.51596L6 4L4 6L5.45337 7.78885L4.3725 10.4463L2 11V13L4.40111 13.6555L5.51575 16.2997L4 18L6 20L7.79116 18.5403L10.397 19.6123L11 22H13L13.6045 19.6132L16.2551 18.5155C16.6969 18.8313 18 20 18 20L20 18L18.5159 16.2494L19.6139 13.598L21.9999 12.9772L22 11L19.6224 10.3954Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AchievementsIcon = ({ className }: IconProps) => (
  <svg
    className={className}
    width="32"
    height="32"
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={1.5}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M12 7L13.7 10.5L17.6 11.1L14.8 13.8L15.5 17.6L12 15.7L8.5 17.6L9.2 13.8L6.4 11.1L10.3 10.5L12 7Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * 主导航组件：根据当前路由高亮菜单，并提供多语言标签。
 */
export function Navigation() {
  const { t } = useTranslation();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  const dashboardLabel = t('navigation.dashboard', { defaultValue: 'Dashboard' });
  const dailyReportLabel = t('navigation.dailyReport', { defaultValue: 'Daily Report' });
  const analyticsLabel = t('navigation.analytics', { defaultValue: 'Analytics' });
  const achievementsLabel = t('navigation.achievements', { defaultValue: 'Achievements' });
  const settingsLabel = t('navigation.settings', { defaultValue: 'Settings' });

  return (
    <nav className="navigation" aria-label={t('navigation.primary', { defaultValue: 'Primary navigation' })}>
      <Link
        to="/"
        className={`nav-item nav-item--dashboard ${isActive('/') ? 'active' : ''}`}
        aria-label={dashboardLabel}
        title={dashboardLabel}
      >
        <DashboardIcon className="nav-icon" />
      </Link>

      <Link
        to="/daily-report"
        className={`nav-item nav-item--daily-report ${isActive('/daily-report') ? 'active' : ''}`}
        aria-label={dailyReportLabel}
        title={dailyReportLabel}
      >
        <DailyReportIcon className="nav-icon" />
      </Link>

      <Link
        to="/analytics"
        className={`nav-item nav-item--analytics ${isActive('/analytics') ? 'active' : ''}`}
        aria-label={analyticsLabel}
        title={analyticsLabel}
      >
        <AnalyticsIcon className="nav-icon" />
      </Link>

      <Link
        to="/achievements"
        className={`nav-item nav-item--achievements ${isActive('/achievements') ? 'active' : ''}`}
        aria-label={achievementsLabel}
        title={achievementsLabel}
      >
        <AchievementsIcon className="nav-icon" />
      </Link>

      <Link
        to="/settings"
        className={`nav-item nav-item--settings ${isActive('/settings') ? 'active' : ''}`}
        aria-label={settingsLabel}
        title={settingsLabel}
      >
        <SettingsIcon className="nav-icon" />
      </Link>
    </nav>
  );
}

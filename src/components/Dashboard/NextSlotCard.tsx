import React from 'react';
import { useTranslation } from 'react-i18next';

interface NextSlotCardProps {
  type: 'work' | 'break';
  time?: string;
  className?: string;
}

export function NextSlotCard({ type, time, className = '' }: NextSlotCardProps) {
  const { t } = useTranslation();

  const getIcon = () => {
    return type === 'work' ? '💼' : '☕';
  };

  const getTitle = () => {
    return type === 'work' ? t('dashboard.nextWork') : t('dashboard.nextBreak');
  };

  const getTimeDisplay = () => {
    if (!time) {
      return t('dashboard.notScheduled');
    }

    try {
      const date = new Date(time);
      if (Number.isNaN(date.getTime())) {
        return t('dashboard.notScheduled');
      }

      return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return t('dashboard.notScheduled');
    }
  };

  const getDateDisplay = () => {
    if (!time) return '';

    try {
      const date = new Date(time);
      if (Number.isNaN(date.getTime())) return '';

      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      if (date.toDateString() === today.toDateString()) {
        return t('dashboard.today');
      } else if (date.toDateString() === tomorrow.toDateString()) {
        return t('dashboard.tomorrow');
      } else {
        return date.toLocaleDateString([], {
          month: 'short',
          day: 'numeric'
        });
      }
    } catch {
      return '';
    }
  };

  return (
    <div className={`dashboard-card next-slot-card ${className}`}>
      <div className="card-header">
        <div className="card-icon">{getIcon()}</div>
        <div className="card-title">{getTitle()}</div>
      </div>
      <div className="card-content">
        <div className="time-display">{getTimeDisplay()}</div>
        {getDateDisplay() && (
          <div className="card-secondary">{getDateDisplay()}</div>
        )}
      </div>
    </div>
  );
}
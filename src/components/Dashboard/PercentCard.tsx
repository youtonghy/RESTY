import React from 'react';

interface PercentCardProps {
  icon: string;
  title: string;
  percentage: number;
  className?: string;
}

export function PercentCard({ icon, title, percentage, className = '' }: PercentCardProps) {
  return (
    <div className={`dashboard-card percent-card ${className}`}>
      <div className="card-header">
        <div className="card-icon">{icon}</div>
        <div className="card-title">{title}</div>
      </div>
      <div className="card-content">
        <div className="card-primary">{percentage.toFixed(1)}%</div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(percentage, 100)}%` }}
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${title}: ${percentage.toFixed(1)}%`}
          />
        </div>
      </div>
    </div>
  );
}
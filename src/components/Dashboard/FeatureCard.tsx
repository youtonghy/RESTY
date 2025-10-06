import React from 'react';

interface FeatureCardProps {
  icon: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function FeatureCard({ icon, title, children, className = '' }: FeatureCardProps) {
  return (
    <div className={`dashboard-card feature-card ${className}`}>
      <div className="card-header">
        <div className="card-icon">{icon}</div>
        <div className="card-title">{title}</div>
      </div>
      <div className="card-content">
        {children}
      </div>
    </div>
  );
}
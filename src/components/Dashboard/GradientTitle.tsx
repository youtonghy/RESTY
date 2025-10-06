import React from 'react';

interface GradientTitleProps {
  children: React.ReactNode;
  className?: string;
}

export function GradientTitle({ children, className = '' }: GradientTitleProps) {
  return (
    <h1 className={`gradient-title ${className}`}>
      {children}
    </h1>
  );
}
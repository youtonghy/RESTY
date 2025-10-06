import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface Tip {
  id: number;
  content: string;
}

interface TipsCardProps {
  className?: string;
}

const EYE_CARE_TIPS: Tip[] = [
  {
    id: 1,
    content: "Every 20 minutes, look at something 20 feet away for 20 seconds (20-20-20 rule)."
  },
  {
    id: 2,
    content: "Blink frequently to keep your eyes moist and prevent digital eye strain."
  },
  {
    id: 3,
    content: "Position your monitor at arm's length and the top of the screen at or below eye level."
  },
  {
    id: 4,
    content: "Adjust screen brightness to match ambient lighting to reduce eye strain."
  },
  {
    id: 5,
    content: "Use artificial tears if you experience dry eyes during extended screen time."
  },
  {
    id: 6,
    content: "Take regular breaks to stand, stretch, and rest your eyes from screen exposure."
  },
  {
    id: 7,
    content: "Ensure proper lighting to minimize glare on your screen."
  },
  {
    id: 8,
    content: "Consider using blue light filters on your devices, especially in the evening."
  },
  {
    id: 9,
    content: "Stay hydrated by drinking enough water throughout the day."
  },
  {
    id: 10,
    content: "Practice eye exercises like palming and eye rolling during breaks."
  }
];

export function TipsCard({ className = '' }: TipsCardProps) {
  const { t } = useTranslation();
  const [currentTips, setCurrentTips] = useState<Tip[]>([]);

  const generateRandomTips = useCallback(() => {
    const shuffled = [...EYE_CARE_TIPS].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, Math.floor(Math.random() * 4) + 3); // 3-6 tips
    setCurrentTips(selected);
  }, []);

  React.useEffect(() => {
    generateRandomTips();
  }, [generateRandomTips]);

  const handleRefresh = () => {
    generateRandomTips();
  };

  return (
    <div className={`dashboard-card tips-card ${className}`}>
      <div className="card-header">
        <div className="card-icon">👁️</div>
        <div className="card-title">{t('dashboard.eyeCareTips')}</div>
      </div>

      <div className="tips-list">
        {currentTips.map((tip) => (
          <div key={tip.id} className="tip-item">
            <div className="tip-icon">💡</div>
            <div>{tip.content}</div>
          </div>
        ))}
      </div>

      <div className="tips-actions">
        <button
          className="btn-refresh"
          onClick={handleRefresh}
          aria-label={t('dashboard.refreshTips')}
        >
          🔄 {t('dashboard.refreshTips')}
        </button>
      </div>
    </div>
  );
}
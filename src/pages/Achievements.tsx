import { useCallback, useEffect, useMemo, useState, type ReactNode, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { AchievementUnlock } from '../types';
import * as api from '../utils/api';
import './Achievements.css';

type AchievementId =
  | 'first_break'
  | 'first_work'
  | 'enable_autostart'
  | 'work_100_hours'
  | 'work_1000_hours'
  | 'break_10_hours'
  | 'break_100_hours';

interface AchievementDefinition {
  id: AchievementId;
  titleKey: string;
  conditionKey: string;
  icon: ReactNode;
}

const BreakAchievementIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M4 8H14V13C14 15.7614 11.7614 18 9 18H7C4.23858 18 2 15.7614 2 13V8H4Z" />
    <path d="M14 9H17C18.6569 9 20 10.3431 20 12C20 13.6569 18.6569 15 17 15H14" />
    <path d="M6 4H12" />
  </svg>
);

const WorkAchievementIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <circle cx="12" cy="12" r="7" />
    <path d="M9 12L11 14L15 10" />
  </svg>
);

const AutostartAchievementIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    stroke="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M12 3V11" />
    <path d="M8.5 5.5C6.23858 6.96133 4.75 9.51223 4.75 12.4C4.75 16.6421 8.10786 20 12.35 20C16.5921 20 19.95 16.6421 19.95 12.4C19.95 9.51223 18.4614 6.96133 16.2 5.5" />
  </svg>
);

const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_work',
    titleKey: 'achievements.items.first_work.title',
    conditionKey: 'achievements.items.first_work.condition',
    icon: <WorkAchievementIcon />,
  },
  {
    id: 'work_100_hours',
    titleKey: 'achievements.items.work_100_hours.title',
    conditionKey: 'achievements.items.work_100_hours.condition',
    icon: <WorkAchievementIcon />,
  },
  {
    id: 'work_1000_hours',
    titleKey: 'achievements.items.work_1000_hours.title',
    conditionKey: 'achievements.items.work_1000_hours.condition',
    icon: <WorkAchievementIcon />,
  },
  {
    id: 'first_break',
    titleKey: 'achievements.items.first_break.title',
    conditionKey: 'achievements.items.first_break.condition',
    icon: <BreakAchievementIcon />,
  },
  {
    id: 'break_10_hours',
    titleKey: 'achievements.items.break_10_hours.title',
    conditionKey: 'achievements.items.break_10_hours.condition',
    icon: <BreakAchievementIcon />,
  },
  {
    id: 'break_100_hours',
    titleKey: 'achievements.items.break_100_hours.title',
    conditionKey: 'achievements.items.break_100_hours.condition',
    icon: <BreakAchievementIcon />,
  },
  {
    id: 'enable_autostart',
    titleKey: 'achievements.items.enable_autostart.title',
    conditionKey: 'achievements.items.enable_autostart.condition',
    icon: <AutostartAchievementIcon />,
  },
];

export function Achievements() {
  const { t } = useTranslation();
  const [unlocks, setUnlocks] = useState<AchievementUnlock[]>([]);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});

  const unlockedIds = useMemo(() => new Set(unlocks.map((item) => item.id)), [unlocks]);
  const orderedAchievements = useMemo(() => {
    const unlocked = ACHIEVEMENTS.filter((item) => unlockedIds.has(item.id));
    const locked = ACHIEVEMENTS.filter((item) => !unlockedIds.has(item.id));
    return [...unlocked, ...locked];
  }, [unlockedIds]);

  const toggleFlip = useCallback((id: AchievementId) => {
    setFlipped((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  useEffect(() => {
    let active = true;
    api
      .getAchievements()
      .then((data) => {
        if (!active) return;
        setUnlocks(data);
      })
      .catch((error) => {
        console.error('Failed to load achievements:', error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const subscribe = async () => {
      try {
        unlisten = await api.onAchievementUnlocked((achievement) => {
          setUnlocks((prev) =>
            prev.some((item) => item.id === achievement.id) ? prev : [...prev, achievement]
          );
        });
      } catch (error) {
        console.error('Failed to subscribe to achievement updates:', error);
      }
    };

    void subscribe();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div className="page achievements-page">
      <div className="container">
        <h1 className="page-title">{t('achievements.title', { defaultValue: 'Achievements' })}</h1>
        <div className="achievements-grid" role="list">
          {orderedAchievements.map((achievement) => {
            const title = t(achievement.titleKey);
            const condition = t(achievement.conditionKey);
            const isUnlocked = unlockedIds.has(achievement.id);
            const isFlipped = Boolean(flipped[achievement.id]);
            return (
              <div className="achievement-cell" role="listitem" key={achievement.id}>
                <button
                  type="button"
                  className={[
                    'achievement-card',
                    `achievement-card--${achievement.id}`,
                    isUnlocked ? 'is-unlocked' : 'is-locked',
                    isFlipped ? 'is-flipped' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleFlip(achievement.id)}
                  aria-pressed={isFlipped}
                  aria-label={`${title} - ${condition}`}
                >
                  <div className="achievement-card__inner">
                    <div className="achievement-card__face achievement-card__front">
                      <span className="achievement-icon" aria-hidden="true">
                        {achievement.icon}
                      </span>
                      <span className="achievement-title">{title}</span>
                    </div>
                    <div className="achievement-card__face achievement-card__back">
                      <span className="achievement-condition">{condition}</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

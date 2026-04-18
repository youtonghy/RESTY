import { useCallback, useEffect, useMemo, useState, type ReactNode, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  generateVisibleAchievements,
  getAchievementDefinitionById,
  type AchievementDefinition,
  type AchievementGroup,
} from '../features/achievements/definitions';
import type { AchievementUnlock } from '../types';
import * as api from '../utils/api';
import './Achievements.css';

interface AchievementGroupDefinition {
  id: AchievementGroup;
  titleKey: string;
  defaultTitle: string;
}

const ACHIEVEMENT_GROUPS: AchievementGroupDefinition[] = [
  { id: 'system', titleKey: 'achievements.groups.system', defaultTitle: 'System' },
  { id: 'work', titleKey: 'achievements.groups.work', defaultTitle: 'Work' },
  { id: 'rest', titleKey: 'achievements.groups.rest', defaultTitle: 'Rest' },
];

const DEFAULT_EXPANDED_GROUPS: Record<AchievementGroup, boolean> = {
  system: true,
  work: true,
  rest: true,
};

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

function getAchievementIcon(def: AchievementDefinition): ReactNode {
  if (def.id === 'enable_autostart') return <AutostartAchievementIcon />;
  if (def.group === 'rest') return <BreakAchievementIcon />;
  return <WorkAchievementIcon />;
}

function getAchievementGroupClass(def: AchievementDefinition): string {
  if (def.id === 'enable_autostart') return 'achievement-card--group-system';
  if (def.group === 'rest') return 'achievement-card--group-rest';
  return 'achievement-card--group-work';
}

const POPUP_AUTO_CLOSE_MS = 4000;

export function Achievements() {
  const { t } = useTranslation();
  const [unlocks, setUnlocks] = useState<AchievementUnlock[]>([]);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [unlockPopupQueue, setUnlockPopupQueue] = useState<AchievementUnlock[]>([]);
  const [activePopup, setActivePopup] = useState<AchievementUnlock | null>(null);
  const [expandedGroups, setExpandedGroups] =
    useState<Record<AchievementGroup, boolean>>(DEFAULT_EXPANDED_GROUPS);

  const unlockedIds = useMemo(() => new Set(unlocks.map((item) => item.id)), [unlocks]);

  const visibleAchievements = useMemo(
    () => generateVisibleAchievements(unlockedIds),
    [unlockedIds]
  );

  const activePopupDefinition = useMemo(
    () => (activePopup ? getAchievementDefinitionById(activePopup.id) : undefined),
    [activePopup]
  );
  const activePopupAchievementName = activePopupDefinition
    ? t(activePopupDefinition.titleKey, activePopupDefinition.titleParams ?? {})
    : activePopup?.id;

  const orderedAchievementsByGroup = useMemo(() => {
    return ACHIEVEMENT_GROUPS.reduce<Record<AchievementGroup, AchievementDefinition[]>>(
      (result, group) => {
        const inGroup = visibleAchievements.filter((item) => item.group === group.id);
        const unlocked = inGroup.filter((item) => unlockedIds.has(item.id));
        const locked = inGroup.filter((item) => !unlockedIds.has(item.id));
        result[group.id] = [...unlocked, ...locked];
        return result;
      },
      {
        system: [],
        work: [],
        rest: [],
      }
    );
  }, [visibleAchievements, unlockedIds]);

  const toggleFlip = useCallback((id: string) => {
    setFlipped((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }, []);

  const toggleGroup = useCallback((group: AchievementGroup) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [group]: !prev[group],
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
          setUnlocks((prev) => {
            if (prev.some((item) => item.id === achievement.id)) {
              return prev;
            }

            setUnlockPopupQueue((queue) => [...queue, achievement]);
            return [...prev, achievement];
          });
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

  const closeActivePopup = useCallback(() => {
    setActivePopup(null);
  }, []);

  useEffect(() => {
    if (activePopup || unlockPopupQueue.length === 0) {
      return;
    }
    setActivePopup(unlockPopupQueue[0]);
    setUnlockPopupQueue((queue) => queue.slice(1));
  }, [activePopup, unlockPopupQueue]);

  useEffect(() => {
    if (!activePopup) {
      return;
    }

    const timerId = window.setTimeout(() => {
      closeActivePopup();
    }, POPUP_AUTO_CLOSE_MS);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [activePopup, closeActivePopup]);

  return (
    <div className="page achievements-page">
      <div className="container">
        {activePopup && (
          <div className="achievement-unlock-popup" role="status" aria-live="polite">
            <div className="achievement-unlock-popup__header">
              <h2 className="achievement-unlock-popup__title">
                {t('achievements.unlockModal.title', { defaultValue: 'Achievement Unlocked' })}
              </h2>
              <button
                type="button"
                className="achievement-unlock-popup__close"
                onClick={closeActivePopup}
                aria-label={t('achievements.unlockModal.close', { defaultValue: 'Close' })}
                title={t('achievements.unlockModal.close', { defaultValue: 'Close' })}
              >
                ×
              </button>
            </div>
            <p className="achievement-unlock-popup__body">
              {t('achievements.unlockModal.body', {
                defaultValue: 'Unlocked achievement: {{name}}',
                name: activePopupAchievementName,
              })}
            </p>
          </div>
        )}
        <h1 className="page-title">{t('achievements.title', { defaultValue: 'Achievements' })}</h1>
        <div className="achievement-groups">
          {ACHIEVEMENT_GROUPS.map((group) => {
            const groupTitle = t(group.titleKey, { defaultValue: group.defaultTitle });
            const groupContentId = `achievements-group-${group.id}`;
            const isExpanded = expandedGroups[group.id];
            const toggleLabel = isExpanded
              ? t('achievements.actions.collapse', { defaultValue: 'Collapse' })
              : t('achievements.actions.expand', { defaultValue: 'Expand' });
            const groupedAchievements = orderedAchievementsByGroup[group.id];

            return (
              <section className="achievement-group" key={group.id}>
                <div className="achievement-group__header">
                  <h2 className="achievement-group__title">{groupTitle}</h2>
                  <button
                    type="button"
                    className="achievement-group__toggle"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isExpanded}
                    aria-controls={groupContentId}
                    aria-label={`${toggleLabel} ${groupTitle}`}
                  >
                    {toggleLabel}
                  </button>
                </div>
                <div
                  id={groupContentId}
                  className={`achievement-group__content ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}
                  hidden={!isExpanded}
                >
                  <div className="achievements-grid" role="list">
                    {groupedAchievements.map((achievement) => {
                      const title = t(achievement.titleKey, achievement.titleParams ?? {});
                      const condition = t(
                        achievement.conditionKey,
                        achievement.conditionParams ?? {}
                      );
                      const isUnlocked = unlockedIds.has(achievement.id);
                      const isFlipped = Boolean(flipped[achievement.id]);
                      return (
                        <div className="achievement-cell" role="listitem" key={achievement.id}>
                          <button
                            type="button"
                            className={[
                              'achievement-card',
                              getAchievementGroupClass(achievement),
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
                                  {getAchievementIcon(achievement)}
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
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

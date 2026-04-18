export type AchievementGroup = 'system' | 'work' | 'rest';

export interface AchievementDefinition {
  id: string;
  group: AchievementGroup;
  hours?: number;
  titleKey: string;
  conditionKey: string;
  titleParams?: Record<string, unknown>;
  conditionParams?: Record<string, unknown>;
}

const STATIC_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: 'first_work',
    group: 'work',
    titleKey: 'achievements.items.first_work.title',
    conditionKey: 'achievements.items.first_work.condition',
  },
  {
    id: 'first_break',
    group: 'rest',
    titleKey: 'achievements.items.first_break.title',
    conditionKey: 'achievements.items.first_break.condition',
  },
  {
    id: 'enable_autostart',
    group: 'system',
    titleKey: 'achievements.items.enable_autostart.title',
    conditionKey: 'achievements.items.enable_autostart.condition',
  },
];

function makeDynamicDef(type: 'work' | 'break', hours: number): AchievementDefinition {
  const group: AchievementGroup = type === 'work' ? 'work' : 'rest';
  const prefix = type === 'work' ? 'work' : 'break';
  const templateType = type === 'work' ? 'work_hours' : 'break_hours';
  return {
    id: `${prefix}_${hours}_hours`,
    group,
    hours,
    titleKey: `achievements.dynamic.${templateType}.title`,
    conditionKey: `achievements.dynamic.${templateType}.condition`,
    titleParams: { hours },
    conditionParams: { hours },
  };
}

/**
 * Work milestones: 10, 100, 500, 1000, then +500 infinitely.
 */
function nextWorkMilestoneHour(prev: number): number {
  const fixed = [10, 100, 500, 1000];
  for (const m of fixed) {
    if (prev < m) return m;
  }
  return prev + 500;
}

/**
 * Break milestones: 10, 100, then +100 up to 1000, then +500 infinitely.
 */
function nextBreakMilestoneHour(prev: number): number {
  if (prev < 10) return 10;
  if (prev < 100) return 100;
  if (prev < 1000) return prev + 100;
  return prev + 500;
}

function generateDynamicMilestones(
  type: 'work' | 'break',
  unlockedIds: Set<string>
): AchievementDefinition[] {
  const prefix = type === 'work' ? 'work' : 'break';
  const nextFn = type === 'work' ? nextWorkMilestoneHour : nextBreakMilestoneHour;
  const milestones: AchievementDefinition[] = [];
  const knownHours = new Set<number>();

  let prev = 0;
  while (true) {
    const hours = nextFn(prev);
    milestones.push(makeDynamicDef(type, hours));
    knownHours.add(hours);

    if (!unlockedIds.has(`${prefix}_${hours}_hours`)) break;
    prev = hours;
  }

  // Include legacy unlocked milestones not in the new sequence (e.g. break_750_hours)
  for (const uid of unlockedIds) {
    const match = uid.match(new RegExp(`^${prefix}_(\\d+)_hours$`));
    if (match) {
      const h = parseInt(match[1], 10);
      if (!knownHours.has(h)) {
        milestones.push(makeDynamicDef(type, h));
      }
    }
  }

  milestones.sort((a, b) => (a.hours ?? 0) - (b.hours ?? 0));
  return milestones;
}

/**
 * Generate the visible achievement list based on which ones are unlocked.
 * Shows all completed milestones plus the next uncompleted one per category.
 */
export function generateVisibleAchievements(
  unlockedIds: Set<string>
): AchievementDefinition[] {
  return [
    ...STATIC_ACHIEVEMENTS,
    ...generateDynamicMilestones('work', unlockedIds),
    ...generateDynamicMilestones('break', unlockedIds),
  ];
}

/**
 * Resolve any achievement ID (static or dynamic) to its definition.
 * Used by App.tsx for unlock notifications.
 */
export function getAchievementDefinitionById(id: string): AchievementDefinition | undefined {
  const found = STATIC_ACHIEVEMENTS.find((a) => a.id === id);
  if (found) return found;

  const workMatch = id.match(/^work_(\d+)_hours$/);
  if (workMatch) {
    return makeDynamicDef('work', parseInt(workMatch[1], 10));
  }

  const breakMatch = id.match(/^break_(\d+)_hours$/);
  if (breakMatch) {
    return makeDynamicDef('break', parseInt(breakMatch[1], 10));
  }

  return undefined;
}

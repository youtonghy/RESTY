export type AchievementId =
  | 'first_break'
  | 'first_work'
  | 'enable_autostart'
  | 'work_10_hours'
  | 'work_100_hours'
  | 'work_500_hours'
  | 'work_1000_hours'
  | 'break_10_hours'
  | 'break_100_hours'
  | 'break_200_hours'
  | 'break_300_hours'
  | 'break_400_hours'
  | 'break_500_hours'
  | 'break_750_hours'
  | 'break_1000_hours';

export type AchievementGroup = 'system' | 'work' | 'rest';

export interface AchievementDefinition {
  id: AchievementId;
  group: AchievementGroup;
  titleKey: string;
  conditionKey: string;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first_work',
    group: 'work',
    titleKey: 'achievements.items.first_work.title',
    conditionKey: 'achievements.items.first_work.condition',
  },
  {
    id: 'work_10_hours',
    group: 'work',
    titleKey: 'achievements.items.work_10_hours.title',
    conditionKey: 'achievements.items.work_10_hours.condition',
  },
  {
    id: 'work_100_hours',
    group: 'work',
    titleKey: 'achievements.items.work_100_hours.title',
    conditionKey: 'achievements.items.work_100_hours.condition',
  },
  {
    id: 'work_500_hours',
    group: 'work',
    titleKey: 'achievements.items.work_500_hours.title',
    conditionKey: 'achievements.items.work_500_hours.condition',
  },
  {
    id: 'work_1000_hours',
    group: 'work',
    titleKey: 'achievements.items.work_1000_hours.title',
    conditionKey: 'achievements.items.work_1000_hours.condition',
  },
  {
    id: 'first_break',
    group: 'rest',
    titleKey: 'achievements.items.first_break.title',
    conditionKey: 'achievements.items.first_break.condition',
  },
  {
    id: 'break_10_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_10_hours.title',
    conditionKey: 'achievements.items.break_10_hours.condition',
  },
  {
    id: 'break_100_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_100_hours.title',
    conditionKey: 'achievements.items.break_100_hours.condition',
  },
  {
    id: 'break_200_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_200_hours.title',
    conditionKey: 'achievements.items.break_200_hours.condition',
  },
  {
    id: 'break_300_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_300_hours.title',
    conditionKey: 'achievements.items.break_300_hours.condition',
  },
  {
    id: 'break_400_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_400_hours.title',
    conditionKey: 'achievements.items.break_400_hours.condition',
  },
  {
    id: 'break_500_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_500_hours.title',
    conditionKey: 'achievements.items.break_500_hours.condition',
  },
  {
    id: 'break_750_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_750_hours.title',
    conditionKey: 'achievements.items.break_750_hours.condition',
  },
  {
    id: 'break_1000_hours',
    group: 'rest',
    titleKey: 'achievements.items.break_1000_hours.title',
    conditionKey: 'achievements.items.break_1000_hours.condition',
  },
  {
    id: 'enable_autostart',
    group: 'system',
    titleKey: 'achievements.items.enable_autostart.title',
    conditionKey: 'achievements.items.enable_autostart.condition',
  },
];

const ACHIEVEMENT_DEFINITION_BY_ID: Record<AchievementId, AchievementDefinition> =
  ACHIEVEMENT_DEFINITIONS.reduce(
    (result, item) => {
      result[item.id] = item;
      return result;
    },
    {} as Record<AchievementId, AchievementDefinition>
  );

export function isAchievementId(id: string): id is AchievementId {
  return id in ACHIEVEMENT_DEFINITION_BY_ID;
}

export function getAchievementDefinitionById(id: string): AchievementDefinition | undefined {
  if (!isAchievementId(id)) {
    return undefined;
  }
  return ACHIEVEMENT_DEFINITION_BY_ID[id];
}

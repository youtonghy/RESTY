import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { CSSProperties, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';
import type { TimerPhase } from '../types';
import * as api from '../utils/api';
import './Dashboard.css';

type SlotType = Extract<TimerPhase, 'work' | 'break'>;

interface PlaceholderSlot {
  id: string;
  type: SlotType;
  start: Date;
}

interface NextSlot {
  type: SlotType;
  start: Date;
  source: 'timer' | 'schedule';
}

const SHIFT_BLUEPRINT: Array<{ type: SlotType; hour: number; minute: number }> = [
  { type: 'work', hour: 9, minute: 0 },
  { type: 'break', hour: 11, minute: 30 },
  { type: 'work', hour: 13, minute: 30 },
  { type: 'break', hour: 16, minute: 0 },
];

const TIP_LIBRARY: Record<'zh' | 'en', string[]> = {
  zh: [
    '遵循20-20-20法则，每20分钟远眺20秒。',
    '显示器亮度略高于环境，减少瞳孔疲劳。',
    '每小时起身伸展肩颈，缓解肌肉紧绷。',
    '保持眨眼频率，每次眨眼都让角膜滋润。',
    '饮水分散在全天，维持泪膜稳定。',
    '屏幕顶部略低于视线，放松颈部发力。',
    '午后开启暖色温模式，柔化蓝光刺激。',
    '阅读合适字号，避免眼睛长时间聚焦。',
  ],
  en: [
    'Follow the 20-20-20 rule; focus far regularly.',
    'Align screen brightness with ambient light levels.',
    'Blink deliberately ten times each hour to refresh tears.',
    'Keep monitor top slightly below relaxed eye level.',
    'Stand and stretch every 60 minutes to relax posture.',
    'Sip water often to keep your tear film stable.',
    'Enable night mode after sunset to soften blue light.',
    'Increase text size to avoid squinting or leaning in.',
  ],
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const joinParts = (parts: Array<string | null | undefined>) =>
  parts.filter(Boolean).join(' · ');

const pad2 = (n: number) => String(n).padStart(2, '0');

const formatCountdown = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(minutes)}:${pad2(seconds)}`;
};

const getStartOfWeek = (date: Date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = (day + 6) % 7; // ISO week: Monday = 0
  start.setDate(start.getDate() - diff);
  return start;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getProgressBetween = (start: Date, end: Date, current: Date) => {
  const total = end.getTime() - start.getTime();
  if (total <= 0) {
    return 0;
  }
  return clamp01((current.getTime() - start.getTime()) / total);
};

const generatePlaceholderSlots = (reference: Date): PlaceholderSlot[] => {
  const startOfDay = new Date(reference);
  startOfDay.setHours(0, 0, 0, 0);

  const slots: PlaceholderSlot[] = [];
  for (let dayOffset = 0; dayOffset < 4; dayOffset += 1) {
    SHIFT_BLUEPRINT.forEach((blueprint, index) => {
      const start = new Date(startOfDay);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(blueprint.hour, blueprint.minute, 0, 0);
      slots.push({
        id: `${blueprint.type}-${dayOffset}-${index}`,
        type: blueprint.type,
        start,
      });
    });
  }
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
};

const generateTip = (language: string): string => {
  const key: 'zh' | 'en' = language.startsWith('zh') ? 'zh' : 'en';
  const pool = TIP_LIBRARY[key];
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
};

type CardId = 'status' | 'next' | 'progress' | 'tips' | 'clock';

type ProgressScope = 'day' | 'week' | 'month' | 'year';
type ProgressPalette = 'warm' | 'cool';

const PROGRESS_TONE_RANGES: Record<ProgressPalette, { min: number; max: number }> = {
  warm: { min: 8, max: 48 },
  cool: { min: 180, max: 240 },
};

const createSeededRandom = (seed: string) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const clampHue = (value: number) => {
  let hue = value % 360;
  if (hue < 0) hue += 360;
  return hue;
};

const toHsl = (hue: number, saturation: number, lightness: number) =>
  `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`;

const toHsla = (hue: number, saturation: number, lightness: number, alpha: number) =>
  `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${alpha.toFixed(
    2
  )})`;

const generateProgressGradient = (seed: string, tone: ProgressPalette) => {
  const rng = createSeededRandom(`${tone}:${seed}`);
  const range = PROGRESS_TONE_RANGES[tone];
  const baseHue = range.min + rng() * (range.max - range.min);
  const accentHue = clampHue(baseHue + (rng() - 0.5) * 14);
  const baseSaturation = 70 + rng() * 12; // 70-82
  const accentSaturation = Math.min(100, baseSaturation + (rng() - 0.5) * 10);
  const baseLightness = 52 + rng() * 12; // 52-64
  const accentLightness = Math.min(92, baseLightness + (rng() - 0.2) * 16);

  const colorStart = toHsl(baseHue, baseSaturation, baseLightness);
  const colorEnd = toHsl(accentHue, accentSaturation, accentLightness);
  const glow = toHsla(accentHue, (baseSaturation + accentSaturation) / 2, accentLightness, 0.32);

  return {
    gradient: `linear-gradient(90deg, ${colorStart} 0%, ${colorEnd} 100%)`,
    glow,
    accent: colorEnd,
  };
};

interface LayoutItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ClockCardSettings {
  timeZone: string | null;
  use12Hour: boolean;
}

interface TipsCardSettings {
  source: 'local' | 'hitokoto';
}

interface ProgressCardSettings {
  scope: ProgressScope;
  palette?: ProgressPalette;
}

interface CardSettings {
  clock?: ClockCardSettings;
  tips?: TipsCardSettings;
  progress?: ProgressCardSettings;
}

interface CardInstance {
  instanceId: string;
  type: CardId;
  layout: LayoutItem;
  styleId?: string | null;
  settings?: CardSettings;
}

interface GridMetrics {
  trackWidth: number;
  trackHeight: number;
  columnGap: number;
  rowGap: number;
  columnSpan: number;
  rowSpan: number;
}

const GRID_COLUMNS = 12;
const BASE_SPAN = 2;
const FALLBACK_TRACK_SIZE = 120;
const CARD_ORDER: CardId[] = ['status', 'next', 'progress', 'tips', 'clock'];
const MAX_GRID_ROWS = 120;
const CARD_STORAGE_KEY = 'resty.dashboard.cards.v2';
interface CardStylePreset {
  id: string;
  name: string;
}

const SUPPORTED_TIMEZONES: Set<string> | null = (() => {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supportedValuesOf !== 'function') {
    return null;
  }
  try {
    const timeZones = supportedValuesOf('timeZone');
    return Array.isArray(timeZones) && timeZones.length ? new Set(timeZones) : null;
  } catch (error) {
    return null;
  }
})();

const sanitizeTimeZone = (zone: unknown): string | null => {
  if (typeof zone !== 'string' || zone.trim() === '') return null;
  const normalized = zone.trim();
  if (SUPPORTED_TIMEZONES && !SUPPORTED_TIMEZONES.has(normalized)) {
    return null;
  }
  try {
    const formatter = new Intl.DateTimeFormat(undefined, { timeZone: normalized });
    formatter.format(Date.now());
    return normalized;
  } catch (error) {
    return null;
  }
};

const sanitizeClockSettings = (settings: unknown): ClockCardSettings | undefined => {
  if (!settings || typeof settings !== 'object') return undefined;
  const clock = settings as Partial<ClockCardSettings> & Record<string, unknown>;
  const timeZone = sanitizeTimeZone(clock.timeZone);
  const use12Hour = clock.use12Hour === undefined ? false : Boolean(clock.use12Hour);
  if (timeZone === null && !use12Hour) {
    return undefined;
  }
  return {
    timeZone,
    use12Hour,
  };
};

const sanitizeTipsSettings = (settings: unknown): TipsCardSettings | undefined => {
  if (!settings || typeof settings !== 'object') return undefined;
  const source = (settings as TipsCardSettings).source;
  if (source === 'hitokoto') {
    return { source: 'hitokoto' };
  }
  return undefined;
};

const sanitizeProgressSettings = (settings: unknown): ProgressCardSettings | undefined => {
  if (!settings || typeof settings !== 'object') return undefined;
  const raw = settings as ProgressCardSettings;
  const scope =
    raw.scope === 'week' || raw.scope === 'month' || raw.scope === 'year' || raw.scope === 'day'
      ? raw.scope
      : 'day';
  const palette: ProgressPalette = raw.palette === 'warm' ? 'warm' : 'cool';
  return { scope, palette };
};

const sanitizeCardSettings = (settings: unknown): CardSettings | undefined => {
  if (!settings || typeof settings !== 'object') return undefined;
  const clock = sanitizeClockSettings((settings as CardSettings).clock);
  const tips = sanitizeTipsSettings((settings as CardSettings).tips);
  const progress = sanitizeProgressSettings((settings as CardSettings).progress);
  if (!clock && !tips && !progress) {
    return undefined;
  }
  return {
    ...(clock ? { clock } : undefined),
    ...(tips ? { tips } : undefined),
    ...(progress ? { progress } : undefined),
  };
};
const CARD_LIMITS: Record<CardId, { minW: number; minH: number; initial: LayoutItem }> = {
  status: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: 0, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  next: { minW: BASE_SPAN, minH: BASE_SPAN, initial: { x: BASE_SPAN, y: 0, w: BASE_SPAN, h: BASE_SPAN } },
  progress: {
    minW: BASE_SPAN,
    minH: BASE_SPAN,
    initial: { x: BASE_SPAN * 2, y: 0, w: BASE_SPAN, h: BASE_SPAN },
  },
  tips: {
    minW: BASE_SPAN * 2,
    minH: BASE_SPAN,
    initial: { x: 0, y: BASE_SPAN, w: BASE_SPAN * 2, h: BASE_SPAN },
  },
  clock: {
    minW: BASE_SPAN * 2,
    minH: BASE_SPAN,
    initial: { x: BASE_SPAN * 2, y: BASE_SPAN, w: BASE_SPAN * 2, h: BASE_SPAN },
  },
};
const CARD_STYLE_PRESETS: Record<CardId, CardStylePreset[]> = {
  status: [],
  next: [],
  progress: [],
  tips: [],
  clock: [],
};
const PROGRESS_PRESETS: Array<{ scope: ProgressScope; layout: LayoutItem }> = [
  {
    scope: 'day',
    layout: { x: BASE_SPAN * 2, y: 0, w: BASE_SPAN, h: BASE_SPAN },
  },
  {
    scope: 'week',
    layout: { x: BASE_SPAN * 3, y: 0, w: BASE_SPAN, h: BASE_SPAN },
  },
  {
    scope: 'month',
    layout: { x: BASE_SPAN * 4, y: 0, w: BASE_SPAN, h: BASE_SPAN },
  },
  {
    scope: 'year',
    layout: { x: BASE_SPAN * 5, y: 0, w: BASE_SPAN, h: BASE_SPAN },
  },
];
const clampLayout = (type: CardId, candidate: LayoutItem): LayoutItem => {
  const limits = CARD_LIMITS[type];

  let width = Math.max(limits.minW, Math.min(candidate.w, GRID_COLUMNS));
  let x = Math.max(0, Math.min(candidate.x, GRID_COLUMNS - width));
  width = Math.min(width, GRID_COLUMNS - x);

  const height = Math.max(limits.minH, candidate.h);
  const y = Math.max(0, candidate.y);

  return { x, y, w: width, h: height };
};

const rectanglesOverlap = (a: LayoutItem, b: LayoutItem) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

const findSlot = (
  width: number,
  height: number,
  preferredX: number,
  preferredY: number,
  occupied: LayoutItem[]
): LayoutItem => {
  const safeWidth = Math.min(width, GRID_COLUMNS);
  const safeHeight = Math.max(1, height);
  const startRow = Math.max(0, preferredY);
  const maxStartX = Math.max(0, GRID_COLUMNS - safeWidth);
  const clampPreferredX = Math.max(0, Math.min(preferredX, maxStartX));

  for (let y = startRow; y < MAX_GRID_ROWS; y += 1) {
    const orderedColumns: number[] = [];
    for (let x = clampPreferredX; x <= maxStartX; x += 1) orderedColumns.push(x);
    for (let x = 0; x < clampPreferredX; x += 1) orderedColumns.push(x);

    for (const x of orderedColumns) {
      const rect = { x, y, w: safeWidth, h: safeHeight };
      const hasCollision = occupied.some((item) => rectanglesOverlap(rect, item));
      if (!hasCollision) {
        return rect;
      }
    }
  }

  for (let y = 0; y < startRow; y += 1) {
    for (let x = 0; x <= maxStartX; x += 1) {
      const rect = { x, y, w: safeWidth, h: safeHeight };
      const hasCollision = occupied.some((item) => rectanglesOverlap(rect, item));
      if (!hasCollision) {
        return rect;
      }
    }
  }

  return { x: clampPreferredX, y: startRow, w: safeWidth, h: safeHeight };
};

const resolveInstances = (
  instances: CardInstance[],
  targetId: string,
  candidate: LayoutItem
): CardInstance[] => {
  const ordered = [...instances].sort((a, b) =>
    a.instanceId === targetId ? -1 : b.instanceId === targetId ? 1 : 0
  );

  const occupied: LayoutItem[] = [];
  const placements = new Map<string, LayoutItem>();

  for (const card of ordered) {
    const desired = clampLayout(
      card.type,
      card.instanceId === targetId ? candidate : card.layout
    );
    const slot = findSlot(desired.w, desired.h, desired.x, desired.y, occupied);
    occupied.push(slot);
    placements.set(card.instanceId, slot);
  }

  return instances.map((card) => ({
    ...card,
    layout: placements.get(card.instanceId) ?? card.layout,
  }));
};

const createInitialInstances = (): CardInstance[] => {
  const instances: CardInstance[] = [
    {
      instanceId: 'status-0',
      type: 'status',
      layout: { ...CARD_LIMITS.status.initial },
      styleId: null,
      settings: undefined,
    },
    {
      instanceId: 'next-0',
      type: 'next',
      layout: { ...CARD_LIMITS.next.initial },
      styleId: null,
      settings: undefined,
    },
  ];

  PROGRESS_PRESETS.forEach((preset, index) => {
    instances.push({
      instanceId: `progress-${index}`,
      type: 'progress',
      layout: clampLayout('progress', preset.layout),
      styleId: null,
      settings: { progress: { scope: preset.scope, palette: 'cool' } },
    });
  });

  instances.push(
    {
      instanceId: 'tips-0',
      type: 'tips',
      layout: { ...CARD_LIMITS.tips.initial },
      styleId: null,
      settings: undefined,
    },
    {
      instanceId: 'clock-0',
      type: 'clock',
      layout: { ...CARD_LIMITS.clock.initial },
      styleId: null,
      settings: undefined,
    }
  );

  return instances;
};

const createCardInstance = (type: CardId, existing: CardInstance[]): CardInstance => {
  const limits = CARD_LIMITS[type];
  const occupied = existing.map((item) => item.layout);
  const preferred = limits.initial;
  const slot = findSlot(limits.initial.w, limits.initial.h, preferred.x, preferred.y, occupied);
  let settings: CardSettings | undefined;
  if (type === 'progress') {
    settings = { progress: { scope: 'day', palette: 'cool' } };
  }
  return {
    instanceId: `${type}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`,
    type,
    layout: clampLayout(type, slot),
    styleId: null,
    settings,
  };
};

const settingsEqual = (a?: CardSettings, b?: CardSettings) => {
  const ac = a?.clock;
  const bc = b?.clock;
  const aZone = ac?.timeZone ?? null;
  const bZone = bc?.timeZone ?? null;
  const aMode = ac?.use12Hour ?? false;
  const bMode = bc?.use12Hour ?? false;
  const at = a?.tips;
  const bt = b?.tips;
  const aSource = at?.source ?? 'local';
  const bSource = bt?.source ?? 'local';
  const ap = a?.progress;
  const bp = b?.progress;
  const aScope = ap?.scope ?? null;
  const bScope = bp?.scope ?? null;
  const aPalette = ap?.palette ?? 'cool';
  const bPalette = bp?.palette ?? 'cool';
  return (
    aZone === bZone &&
    aMode === bMode &&
    aSource === bSource &&
    aScope === bScope &&
    aPalette === bPalette
  );
};

const cardsEqual = (a: CardInstance[], b: CardInstance[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const lhs = a[i];
    const rhs = b[i];
    if (lhs.instanceId !== rhs.instanceId || lhs.type !== rhs.type) return false;
    if ((lhs.styleId ?? null) !== (rhs.styleId ?? null)) return false;
    if (!settingsEqual(lhs.settings, rhs.settings)) return false;
    const la = lhs.layout;
    const lb = rhs.layout;
    if (la.x !== lb.x || la.y !== lb.y || la.w !== lb.w || la.h !== lb.h) return false;
  }
  return true;
};

const loadPersistedCards = (): CardInstance[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CARD_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CardInstance[];
    const sanitized: CardInstance[] = [];
    for (const item of parsed) {
      if (!item || !item.instanceId || typeof item.type !== 'string') continue;
      let rawType = item.type as CardId | ProgressScope;
      let inferredScope: ProgressScope | undefined;
      if (rawType === 'day' || rawType === 'week' || rawType === 'month' || rawType === 'year') {
        inferredScope = rawType;
        rawType = 'progress';
      }
      const type = rawType as CardId;
      if (!CARD_LIMITS[type]) continue;
      let settings = sanitizeCardSettings((item as CardInstance).settings);
      if (inferredScope) {
        const scope = settings?.progress?.scope ?? inferredScope;
        const palette: ProgressPalette = settings?.progress?.palette === 'warm' ? 'warm' : 'cool';
        settings = {
          ...(settings ?? {}),
          progress: { scope, palette },
        };
      }
      sanitized.push({
        instanceId: item.instanceId,
        type,
        layout: clampLayout(type, item.layout),
        styleId: item.styleId ?? null,
        settings,
      });
    }
    return sanitized.length ? sanitized : null;
  } catch (error) {
    console.warn('Failed to load dashboard cards:', error);
    return null;
  }
};

const migrateLegacyLayout = (): CardInstance[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('resty.dashboard.layout.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<CardId | ProgressScope, LayoutItem>>;
    const fallback = createInitialInstances();
    return fallback.map((card) => ({
      ...card,
      layout: clampLayout(
        card.type,
        card.type === 'progress'
          ? parsed?.[(card.settings?.progress?.scope ?? 'day') as CardId | ProgressScope] ?? card.layout
          : parsed?.[card.type] ?? card.layout
      ),
      styleId: null,
      settings: card.type === 'progress' ? card.settings : undefined,
    }));
  } catch (error) {
    console.warn('Failed to migrate legacy dashboard layout:', error);
    return null;
  }
};

const persistCards = (cards: CardInstance[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CARD_STORAGE_KEY, JSON.stringify(cards));
  } catch (error) {
    console.warn('Failed to persist dashboard cards:', error);
  }
};

// Relative time display not used in simplified next-slot card

function useFadeInOnScroll<T extends HTMLElement>(delay: number) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.setProperty('--tile-delay', `${delay}ms`);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [delay]);

  return ref;
}

// Title component removed per simplification

const WorkFocusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M3 7.4V3.6C3 3.26863 3.26863 3 3.6 3H9.4C9.73137 3 10 3.26863 10 3.6V7.4C10 7.73137 9.73137 8 9.4 8H3.6C3.26863 8 3 7.73137 3 7.4Z" />
    <path d="M14 20.4V16.6C14 16.2686 14.2686 16 14.6 16H20.4C20.7314 16 21 16.2686 21 16.6V20.4C21 20.7314 20.7314 21 20.4 21H14.6C14.2686 21 14 20.7314 14 20.4Z" />
    <path d="M14 12.4V3.6C14 3.26863 14.2686 3 14.6 3H20.4C20.7314 3 21 3.26863 21 3.6V12.4C21 12.7314 20.7314 13 20.4 13H14.6C14.2686 13 14 12.7314 14 12.4Z" />
    <path d="M3 20.4V11.6C3 11.2686 3.26863 11 3.6 11H9.4C9.73137 11 10 11.2686 10 11.6V20.4C10 20.7314 9.73137 21 9.4 21H3.6C3.26863 21 3 20.7314 3 20.4Z" />
  </svg>
);

const BreakFocusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M3 15C5.48276 15 7.34483 12 7.34483 12C7.34483 12 9.2069 15 11.6897 15C14.1724 15 16.6552 12 16.6552 12C16.6552 12 19.1379 15 21 15" />
    <path d="M3 20C5.48276 20 7.34483 17 7.34483 17C7.34483 17 9.2069 20 11.6897 20C14.1724 20 16.6552 17 16.6552 17C16.6552 17 19.1379 20 21 20" />
    <path d="M19 10C19 6.13401 15.866 3 12 3C8.13401 3 5 6.13401 5 10" />
  </svg>
);

const ClockIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M12 6V12H18" />
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
  </svg>
);

const ProgressIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M12 6V12H18" />
    <path d="M21.8883 10.5C21.1645 5.68874 17.013 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C16.1006 22 19.6248 19.5318 21.1679 16" />
    <path d="M17 16H21.4C21.7314 16 22 16.2686 22 16.6V21" />
  </svg>
);

const NextSessionIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width="100%"
    height="100%"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    <path d="M8.5 9C8.22386 9 8 8.77614 8 8.5C8 8.22386 8.22386 8 8.5 8C8.77614 8 9 8.22386 9 8.5C9 8.77614 8.77614 9 8.5 9Z" fill="currentColor" />
    <path d="M14 9H16" />
    <path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" />
    <path d="M7.5 14.5C7.5 14.5 9 16.5 12 16.5C15 16.5 16.5 14.5 16.5 14.5" />
  </svg>
);


interface FeatureCardProps {
  primary: string;
  label: string;
  icon?: ReactNode;
  iconTone?: 'focus' | 'break' | 'paused' | 'idle' | 'offline' | 'clock' | 'progress' | 'neutral';
  delay?: number;
  children?: ReactNode;
  progress?: number; // 0..1 (optional) — when provided, card background fills as progress
  className?: string;
  style?: CSSProperties;
  tabIndex?: number;
  role?: string;
  ariaLabel?: string;
  onClick?: () => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}

function FeatureCard({
  primary,
  label,
  icon,
  iconTone,
  delay = 0,
  children,
  progress,
  className,
  style,
  tabIndex = 0,
  role = 'listitem',
  ariaLabel,
  onClick,
  onKeyDown,
}: FeatureCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);
  const classes = [
    `tile-card`,
    className,
    progress !== undefined ? 'has-progress' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  const computedStyle =
    progress !== undefined
      ? ({
          ['--progress' as any]: String(clamp01(progress)),
          ...(style as CSSProperties | undefined),
        } as CSSProperties)
      : (style as CSSProperties | undefined);

  return (
    <section
      ref={ref}
      className={classes}
      style={computedStyle}
      tabIndex={tabIndex}
      role={role}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="tile-primary-row">
        {icon && (
          <span
            className={['tile-icon', iconTone ? `tile-icon--${iconTone}` : undefined].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <span className="tile-primary">{primary}</span>
      </div>
      <div className="tile-label">{label}</div>
      {children}
    </section>
  );
}

interface PercentCardProps {
  value: number;
  label: string;
  info?: string;
  formatted: string;
  delay?: number;
  gradient?: string;
  glow?: string;
  accent?: string;
  tabIndex?: number;
}

function PercentCard({
  value,
  label,
  info,
  formatted,
  delay = 0,
  gradient,
  glow,
  accent,
  tabIndex,
}: PercentCardProps) {
  const progressStyle =
    gradient || glow || accent
      ? ({
          ...(gradient ? { ['--progress-gradient' as any]: gradient } : null),
          ...(glow ? { ['--progress-glow' as any]: glow } : null),
          ...(accent ? { ['--progress-icon-color' as any]: accent } : null),
        } as CSSProperties)
      : undefined;

  return (
    <FeatureCard
      primary={formatted}
      label={joinParts([label, info])}
      icon={<ProgressIcon />}
      iconTone="progress"
      progress={clamp01(value)}
      delay={delay}
      style={progressStyle}
      tabIndex={tabIndex}
    />
  );
}

interface NextSlotCardProps {
  primary: string;
  secondary: string;
  delay?: number;
  tabIndex?: number;
  onActivate?: () => void;
  actionLabel?: string;
}

function NextSlotCard({
  primary,
  secondary,
  delay = 0,
  tabIndex,
  onActivate,
  actionLabel,
}: NextSlotCardProps) {
  const isActionable = typeof onActivate === 'function';
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isActionable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate?.();
    }
  };
  const resolvedTabIndex = isActionable ? 0 : tabIndex;

  return (
    <FeatureCard
      primary={primary}
      label={secondary}
      icon={<NextSessionIcon />}
      iconTone="neutral"
      delay={delay}
      tabIndex={resolvedTabIndex}
      className={isActionable ? 'tile-card-actionable' : undefined}
      role={isActionable ? 'button' : undefined}
      ariaLabel={isActionable ? actionLabel ?? secondary : undefined}
      onClick={isActionable ? onActivate : undefined}
      onKeyDown={isActionable ? handleKeyDown : undefined}
    />
  );
}

interface TipsCardProps {
  tip: string;
  delay?: number;
  tabIndex?: number;
}

function TipsCard({ tip, delay = 0, tabIndex = 0 }: TipsCardProps) {
  const ref = useFadeInOnScroll<HTMLElement>(delay);

  return (
    <section ref={ref} className="tile-card tips-card" tabIndex={tabIndex} role="listitem">
      <span className="tips-text">{tip}</span>
    </section>
  );
}

interface TipsCardRendererProps {
  instance: CardInstance;
  language: string;
  isZh: boolean;
  delay?: number;
  tabIndex?: number;
}

function TipsCardRenderer({ instance, language, isZh, delay = 0, tabIndex }: TipsCardRendererProps) {
  const source = instance.settings?.tips?.source ?? 'local';
  const [content, setContent] = useState(() =>
    source === 'hitokoto' ? (isZh ? '加载中…' : 'Loading…') : generateTip(language)
  );

  useEffect(() => {
    if (source === 'hitokoto') {
      const controller = new AbortController();
      setContent(isZh ? '加载中…' : 'Loading…');
      fetch('https://v1.hitokoto.cn/?encode=json', { signal: controller.signal })
        .then((response) => {
          if (!response.ok) {
            throw new Error('Failed to fetch hitokoto');
          }
          return response.json();
        })
        .then((data: { hitokoto?: string | null }) => {
          if (controller.signal.aborted) return;
          const text = typeof data?.hitokoto === 'string' && data.hitokoto.trim().length
            ? data.hitokoto.trim()
            : isZh
            ? '暂时没有一言，稍后再试。'
            : 'No quote available right now.';
          setContent(text);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setContent(isZh ? '加载失败，稍后再试。' : 'Failed to load. Please try again.');
          if (error instanceof Error && error.name !== 'AbortError') {
            console.warn('Hitokoto fetch failed:', error);
          }
        });
      return () => {
        controller.abort();
      };
    }

    setContent(generateTip(language));
    return undefined;
  }, [source, language, isZh]);

  return <TipsCard tip={content} delay={delay} tabIndex={tabIndex} />;
}

interface ProgressCardRendererProps {
  instance: CardInstance;
  scopes: Record<ProgressScope, { value: number; formatted: string; label: string; info?: string }>;
  delay?: number;
  tabIndex?: number;
}

function ProgressCardRenderer({ instance, scopes, delay = 0, tabIndex }: ProgressCardRendererProps) {
  const progressSettings = instance.settings?.progress;
  const scope = progressSettings?.scope ?? 'day';
  const palette: ProgressPalette = progressSettings?.palette === 'warm' ? 'warm' : 'cool';
  const gradientTheme = useMemo(
    () => generateProgressGradient(instance.instanceId, palette),
    [instance.instanceId, palette]
  );
  const config = scopes[scope] ?? scopes.day;
  return (
    <PercentCard
      value={config.value}
      formatted={config.formatted}
      label={config.label}
      info={config.info}
      delay={delay}
      gradient={gradientTheme.gradient}
      glow={gradientTheme.glow}
      accent={gradientTheme.accent}
      tabIndex={tabIndex}
    />
  );
}

interface ClockCardProps {
  time: string;
  date: string;
  timezone: string;
  delay?: number;
  tabIndex?: number;
}

function ClockCard({ time, date, timezone, delay = 0, tabIndex }: ClockCardProps) {
  return (
    <FeatureCard
      primary={time}
      label={joinParts([date, timezone])}
      icon={<ClockIcon />}
      iconTone="clock"
      delay={delay}
      className="clock-card"
      tabIndex={tabIndex}
    />
  );
}

interface DashboardProps {
  isReadOnly?: boolean;
  nextCardAction?: {
    primary?: string;
    secondary?: string;
    onActivate?: () => void;
    actionLabel?: string;
  };
}

/**
 * 仪表盘页面：苹果发布会信息卡拼贴风格的番茄工作状态总览。
 */
export function Dashboard({ isReadOnly = false, nextCardAction }: DashboardProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language.startsWith('zh');
  const { timerInfo, setTimerInfo, settings } = useAppStore();
  const [now, setNow] = useState(() => new Date());
  const cardTabIndex = isReadOnly ? -1 : 0;

  const [cardInstances, setCardInstances] = useState<CardInstance[]>(() =>
    loadPersistedCards() ?? migrateLegacyLayout() ?? createInitialInstances()
  );
  const [metrics, setMetrics] = useState<GridMetrics>(() => ({
    trackWidth: FALLBACK_TRACK_SIZE,
    trackHeight: FALLBACK_TRACK_SIZE,
    columnGap: 24,
    rowGap: 24,
    columnSpan: FALLBACK_TRACK_SIZE + 24,
    rowSpan: FALLBACK_TRACK_SIZE + 24,
  }));
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [isAddMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    persistCards(cardInstances);
  }, [cardInstances]);

  useEffect(() => {
    api.getTimerInfo().then(setTimerInfo).catch((error) => {
      console.error('Failed to load timer info:', error);
    });

    let unsubscribe: (() => void) | undefined;

    const setup = async () => {
      unsubscribe = await api.onTimerUpdate((info) => {
        setTimerInfo(info);
      });
    };

    setup();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [setTimerInfo]);

  useEffect(() => {
    // 每秒刷新一次，确保倒计时显示顺畅
    const id = window.setInterval(() => {
      setNow(new Date());
    }, 1_000);
    return () => window.clearInterval(id);
  }, []);

  
  const dateKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  const placeholderSlots = useMemo(() => generatePlaceholderSlots(now), [dateKey]);

  // 计算“下次休息”的时间：优先使用后端提供的 nextBreakTime（已考虑抑制逻辑），否则回退到占位日程中的下一段 break
  const nextBreakSlot = useMemo<NextSlot | null>(() => {
    if (settings.flowModeEnabled) {
      return null;
    }

    const raw = timerInfo.nextBreakTime as unknown as string | null | undefined;
    if (raw) {
      const start = new Date(raw);
      if (!Number.isNaN(start.getTime())) {
        return { type: 'break', start, source: 'timer' };
      }
    }
    // fallback: use the next placeholder break slot after now
    const upcomingBreak = placeholderSlots.find(
      (slot) => slot.type === 'break' && slot.start.getTime() > now.getTime()
    );
    return upcomingBreak
      ? { type: 'break', start: upcomingBreak.start, source: 'schedule' }
      : null;
  }, [timerInfo, placeholderSlots, now, settings.flowModeEnabled]);

  const dayProgress = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = addDays(start, 1);
    return getProgressBetween(start, end, now);
  }, [now]);

  const weekProgress = useMemo(() => {
    const start = getStartOfWeek(now);
    const end = addDays(start, 7);
    return getProgressBetween(start, end, now);
  }, [now]);

  const monthProgress = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return getProgressBetween(start, end, now);
  }, [now]);

  const yearProgress = useMemo(() => {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear() + 1, 0, 1);
    return getProgressBetween(start, end, now);
  }, [now]);

  const percentFormatter = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    [i18n.language]
  );

  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    [i18n.language]
  );

  const statusContent = useMemo((): {
    primary: string;
    label: string;
    icon: ReactNode;
    tone?: FeatureCardProps['iconTone'];
  } => {
    if (timerInfo.state === 'running' && timerInfo.phase === 'work') {
      return {
        primary: t('dashboard.status.work.primary', { defaultValue: isZh ? '工作中' : 'In focus' }),
        label: t('dashboard.status.work.label', {
          defaultValue: isZh ? '保持专注，完成当下任务。' : 'Deep focus in progress.',
        }),
        icon: <WorkFocusIcon />,
        tone: 'focus',
      };
    }
    if (timerInfo.state === 'running' && timerInfo.phase === 'break') {
      return {
        primary: t('dashboard.status.break.primary', { defaultValue: isZh ? '休息中' : 'On break' }),
        label: t('dashboard.status.break.label', {
          defaultValue: isZh ? '舒展肩颈，喝口水补充能量。' : 'Loosen up and hydrate.',
        }),
        icon: <BreakFocusIcon />,
        tone: 'break',
      };
    }
    if (timerInfo.state === 'paused') {
      return {
        primary: t('dashboard.status.paused.primary', { defaultValue: isZh ? '已暂停' : 'Paused' }),
        label: t('dashboard.status.paused.label', {
          defaultValue: isZh ? '随时继续，别忘记调整状态。' : 'Ready to resume when you are.',
        }),
        icon: '🟡',
        tone: 'paused',
      };
    }
    if (timerInfo.state === 'stopped' && timerInfo.phase === 'idle') {
      return {
        primary: t('dashboard.status.idle.primary', { defaultValue: isZh ? '待命' : 'Idle' }),
        label: t('dashboard.status.idle.label', {
          defaultValue: isZh ? '下一段节奏尚未开始。' : 'Awaiting the next rhythm.',
        }),
        icon: '⚪',
        tone: 'idle',
      };
    }
    return {
      primary: t('dashboard.status.offline.primary', { defaultValue: isZh ? '离线' : 'Offline' }),
      label: t('dashboard.status.offline.label', {
        defaultValue: isZh ? '番茄钟静默，随时准备启动。' : 'Pomodoro is standing by.',
      }),
      icon: '⚫',
      tone: 'offline',
    };
  }, [t, timerInfo.state, timerInfo.phase, isZh]);

  const systemTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const timeZoneOptions = useMemo(() => {
    if (!SUPPORTED_TIMEZONES) return [] as string[];
    return Array.from(SUPPORTED_TIMEZONES).sort((a, b) => a.localeCompare(b));
  }, []);

  const filteredTimeZones = useMemo(
    () => timeZoneOptions.filter((zone) => zone !== systemTimeZone),
    [timeZoneOptions, systemTimeZone]
  );

  // Next break display: show countdown instead of absolute time
  const nextPrimary = nextBreakSlot
    ? formatCountdown(nextBreakSlot.start.getTime() - now.getTime())
    : '—';
  const slotTypeLabel = nextBreakSlot
    ? t('dashboard.next.break', { defaultValue: isZh ? '下次休息' : 'Next break' })
    : t('dashboard.next.none', { defaultValue: isZh ? '未计划' : 'No schedule' });
  // Only show the label (e.g., Next break), hide source/relative/timezone
  const nextSecondary = slotTypeLabel;
  const nextCardPrimary = nextCardAction?.primary ?? nextPrimary;
  const nextCardSecondary = nextCardAction?.secondary ?? nextSecondary;
  const nextCardTabIndex = nextCardAction?.onActivate ? 0 : cardTabIndex;

  const dayLabel = t('dashboard.progress.day.label', {
    defaultValue: isZh ? '今天进度' : 'Today progress',
  });
  const weekLabel = t('dashboard.progress.week.label', {
    defaultValue: isZh ? '本周进度' : 'Week progress',
  });
  const monthLabel = t('dashboard.progress.month.label', {
    defaultValue: isZh ? '本月进度' : 'Month progress',
  });
  const yearLabel = t('dashboard.progress.year.label', {
    defaultValue: isZh ? '今年进度' : 'Year progress',
  });

  const dayInfo = timeFormatter.format(now);

  const progressScopeData = useMemo(
    () => ({
      day: {
        value: dayProgress,
        formatted: percentFormatter.format(dayProgress),
        label: dayLabel,
        info: dayInfo,
      },
      week: {
        value: weekProgress,
        formatted: percentFormatter.format(weekProgress),
        label: weekLabel,
      },
      month: {
        value: monthProgress,
        formatted: percentFormatter.format(monthProgress),
        label: monthLabel,
      },
      year: {
        value: yearProgress,
        formatted: percentFormatter.format(yearProgress),
        label: yearLabel,
      },
    }),
    [
      dayProgress,
      dayLabel,
      dayInfo,
      monthLabel,
      monthProgress,
      percentFormatter,
      weekLabel,
      weekProgress,
      yearLabel,
      yearProgress,
    ]
  );

  const attemptUpdate = useCallback((instanceId: string, candidate: LayoutItem) => {
    let applied = false;
    setCardInstances((prev) => {
      if (!prev.some((card) => card.instanceId === instanceId)) {
        return prev;
      }
      const resolved = resolveInstances(prev, instanceId, candidate);
      if (cardsEqual(prev, resolved)) {
        return prev;
      }
      applied = true;
      return resolved;
    });
    return applied;
  }, []);

  const handleRemoveCard = useCallback((instanceId: string) => {
    setCardInstances((prev) => prev.filter((card) => card.instanceId !== instanceId));
  }, []);

  const handleAddCard = useCallback((type: CardId) => {
    setCardInstances((prev) => {
      const created = createCardInstance(type, prev);
      const withNew = [...prev, created];
      return resolveInstances(withNew, created.instanceId, created.layout);
    });
  }, []);

  const handleSelectStyle = useCallback((instanceId: string, styleId: string | null) => {
    setCardInstances((prev) =>
      prev.map((card) =>
        card.instanceId === instanceId
          ? {
              ...card,
              styleId,
            }
          : card
      )
    );
  }, []);

  const handleUpdateSettings = useCallback(
    (instanceId: string, updater: (prev: CardSettings | undefined) => CardSettings | undefined) => {
      setCardInstances((prev) =>
        prev.map((card) =>
          card.instanceId === instanceId
            ? {
                ...card,
                settings: updater(card.settings),
              }
            : card
        )
      );
    },
    []
  );

  useEffect(() => {
    if (!isAddMenuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addMenuRef.current?.contains(target)) return;
      if (addButtonRef.current?.contains(target)) return;
      setAddMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [isAddMenuOpen]);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      const width = entry.contentRect.width;
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : width;
      const gap = Math.round(Math.max(18, Math.min(28, viewportWidth * 0.02)));
      const columnGap = gap;
      const rowGap = gap;
      const baseWidth = (width - columnGap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

      setMetrics((previous) => {
        const candidate =
          Number.isFinite(baseWidth) && baseWidth > 0
            ? baseWidth
            : previous.trackWidth || FALLBACK_TRACK_SIZE;
        const trackSize = Math.max(1, Math.floor(candidate));

        return {
          trackWidth: trackSize,
          trackHeight: trackSize,
          columnGap,
          rowGap,
          columnSpan: trackSize + columnGap,
          rowSpan: trackSize + rowGap,
        };
      });
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const gridStyle: CSSProperties = useMemo(
    () => ({
      gridTemplateColumns: `repeat(${GRID_COLUMNS}, ${Math.max(1, metrics.trackWidth)}px)`,
      gridAutoRows: `${Math.max(1, metrics.trackHeight)}px`,
      columnGap: `${metrics.columnGap}px`,
      rowGap: `${metrics.rowGap}px`,
    }),
    [metrics]
  );

  const cardCatalog = useMemo<Record<
    CardId,
    { minW: number; minH: number; render: (instance: CardInstance, delay: number) => ReactNode }
  >>(
    () => ({
      status: {
        minW: CARD_LIMITS.status.minW,
        minH: CARD_LIMITS.status.minH,
        render: (_instance, delay: number) => (
          <FeatureCard
            primary={statusContent.primary}
            label={statusContent.label}
            icon={statusContent.icon}
            iconTone={statusContent.tone}
            delay={delay}
            tabIndex={cardTabIndex}
          />
        ),
      },
      next: {
        minW: CARD_LIMITS.next.minW,
        minH: CARD_LIMITS.next.minH,
        render: (_instance, delay: number) => (
          <NextSlotCard
            primary={nextCardPrimary}
            secondary={nextCardSecondary}
            delay={delay}
            tabIndex={nextCardTabIndex}
            onActivate={nextCardAction?.onActivate}
            actionLabel={nextCardAction?.actionLabel}
          />
        ),
      },
      progress: {
        minW: CARD_LIMITS.progress.minW,
        minH: CARD_LIMITS.progress.minH,
        render: (instance, delay: number) => (
          <ProgressCardRenderer
            instance={instance}
            scopes={progressScopeData}
            delay={delay}
            tabIndex={cardTabIndex}
          />
        ),
      },
      tips: {
        minW: CARD_LIMITS.tips.minW,
        minH: CARD_LIMITS.tips.minH,
        render: (instance, delay: number) => (
          <TipsCardRenderer
            instance={instance}
            language={i18n.language}
            isZh={isZh}
            delay={delay}
            tabIndex={cardTabIndex}
          />
        ),
      },
      clock: {
        minW: CARD_LIMITS.clock.minW,
        minH: CARD_LIMITS.clock.minH,
        render: (instance, delay: number) => {
          const settings = instance.settings?.clock;
          const selectedTimeZone = settings?.timeZone;
          const use12Hour = settings?.use12Hour ?? false;
          const timeZone = selectedTimeZone ?? systemTimeZone;
          const timeFormatterWithZone = new Intl.DateTimeFormat(i18n.language, {
            hour: '2-digit',
            minute: '2-digit',
            hour12: use12Hour,
            timeZone,
          });
          const dateFormatterWithZone = new Intl.DateTimeFormat(i18n.language, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            timeZone,
          });
          const timeString = timeFormatterWithZone.format(now);
          const dateString = dateFormatterWithZone.format(now);

          return (
            <ClockCard
              time={timeString}
              date={dateString}
              timezone={timeZone}
              delay={delay}
              tabIndex={cardTabIndex}
            />
          );
        },
      },
    }),
    [
      cardTabIndex,
      dayInfo,
      i18n.language,
      nextCardAction?.actionLabel,
      nextCardAction?.onActivate,
      nextCardPrimary,
      nextCardSecondary,
      nextCardTabIndex,
      now,
      progressScopeData,
      statusContent,
      systemTimeZone,
      isZh,
    ]
  );

  const cardLabels = useMemo<Record<CardId, string>>(
    () => ({
      status: t('dashboard.cardNames.status', {
        defaultValue: isZh ? '专注状态' : 'Focus status',
      }),
      next: t('dashboard.cardNames.next', {
        defaultValue: isZh ? '下次节奏' : 'Next session',
      }),
      progress: t('dashboard.cardNames.progress', {
        defaultValue: isZh ? '进度卡片' : 'Progress card',
      }),
      tips: t('dashboard.cardNames.tips', {
        defaultValue: isZh ? '贴士卡片' : 'Tips card',
      }),
      clock: t('dashboard.cardNames.clock', {
        defaultValue: isZh ? '当前时间' : 'Clock',
      }),
    }),
    [t, isZh]
  );

  const renderedCards = cardInstances.map((card, index) => {
    const config = cardCatalog[card.type];
    if (!config) return null;
    const delay = Math.min(index * 60, 420);
    const removeLabel = isZh
      ? `移除 ${cardLabels[card.type]}`
      : `Remove ${cardLabels[card.type]}`;
    const noStyleLabel = isZh ? '暂无更多样式' : 'No additional styles';
    const resetStyleLabel = isZh ? '恢复默认样式' : 'Use default style';
    const styleModalTitle = isZh ? '自定义卡片样式' : 'Customize card style';
    const styleModalCloseLabel = isZh ? '关闭' : 'Close';
    const isActionable =
      isReadOnly && card.type === 'next' && typeof nextCardAction?.onActivate === 'function';
    let renderCustomContent: ((close: () => void) => ReactNode) | undefined;

    if (card.type === 'clock') {
      const clockSettings = card.settings?.clock;
      const selectedZone = clockSettings?.timeZone ?? null;
      const use12Hour = clockSettings?.use12Hour ?? false;
      const timezoneLabel = isZh ? '时区' : 'Time zone';
      const formatLabel = isZh ? '时间格式' : 'Time format';
      const option12Label = isZh ? '12 小时制' : '12-hour';
      const option24Label = isZh ? '24 小时制' : '24-hour';
      const systemOptionLabel = isZh
        ? `跟随系统（${systemTimeZone}）`
        : `System default (${systemTimeZone})`;
      const clockDefaults: ClockCardSettings = { timeZone: null, use12Hour: false };

      const updateClockSettings = (
        updater: (prev: ClockCardSettings) => ClockCardSettings
      ) => {
        handleUpdateSettings(card.instanceId, (prev) => {
          const base = prev?.clock ?? clockDefaults;
          const next = updater({ ...base });
          const normalized: ClockCardSettings = {
            timeZone: next.timeZone ?? null,
            use12Hour: next.use12Hour ?? false,
          };
          const hasCustom = normalized.timeZone !== null || normalized.use12Hour !== false;
          if (!hasCustom) {
            if (!prev) return undefined;
            const { clock: _omit, ...rest } = prev;
            return Object.keys(rest).length ? rest : undefined;
          }
          return { ...(prev ?? {}), clock: normalized };
        });
      };

      renderCustomContent = () => (
        <div className="card-style-custom">
          <label className="card-style-field">
            <span className="card-style-field-label">{timezoneLabel}</span>
            <select
              className="card-style-select"
              value={selectedZone ?? 'system'}
              onChange={(event) => {
                const value = event.target.value;
                const nextZone = value === 'system' ? null : sanitizeTimeZone(value) ?? null;
                updateClockSettings((prevClock) => ({
                  ...prevClock,
                  timeZone: nextZone,
                }));
              }}
            >
              <option value="system">{systemOptionLabel}</option>
              {filteredTimeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="card-style-field">
            <legend className="card-style-field-label">{formatLabel}</legend>
            <div className="card-style-radio-group">
              <label
                className={`card-style-choice${!use12Hour ? ' is-selected' : ''}`}
                htmlFor={`${card.instanceId}-clock-format-24`}
              >
                <input
                  id={`${card.instanceId}-clock-format-24`}
                  className="card-style-choice-input"
                  type="radio"
                  name={`${card.instanceId}-clock-format`}
                  value="24"
                  checked={!use12Hour}
                  onChange={() => {
                    updateClockSettings((prevClock) => ({
                      ...prevClock,
                      use12Hour: false,
                    }));
                  }}
                />
                <span className="card-style-choice-marker" aria-hidden="true" />
                <span className="card-style-choice-text">{option24Label}</span>
              </label>
              <label
                className={`card-style-choice${use12Hour ? ' is-selected' : ''}`}
                htmlFor={`${card.instanceId}-clock-format-12`}
              >
                <input
                  id={`${card.instanceId}-clock-format-12`}
                  className="card-style-choice-input"
                  type="radio"
                  name={`${card.instanceId}-clock-format`}
                  value="12"
                  checked={use12Hour}
                  onChange={() => {
                    updateClockSettings((prevClock) => ({
                      ...prevClock,
                      use12Hour: true,
                    }));
                  }}
                />
                <span className="card-style-choice-marker" aria-hidden="true" />
                <span className="card-style-choice-text">{option12Label}</span>
              </label>
            </div>
          </fieldset>
        </div>
      );
    }

    if (card.type === 'progress') {
      const progressSettings = card.settings?.progress;
      const selectedScope = progressSettings?.scope ?? 'day';
      const selectedPalette: ProgressPalette = progressSettings?.palette === 'warm' ? 'warm' : 'cool';
      const scopeLabel = isZh ? '统计范围' : 'Scope';
      const paletteLabel = isZh ? '色调' : 'Tone';
      const progressDefaults: ProgressCardSettings = { scope: 'day', palette: 'cool' };
      const scopeOptions: Array<{ value: ProgressScope; label: string }> = [
        { value: 'day', label: dayLabel },
        { value: 'week', label: weekLabel },
        { value: 'month', label: monthLabel },
        { value: 'year', label: yearLabel },
      ];
      const paletteOptions: Array<{ value: ProgressPalette; label: string }> = [
        { value: 'cool', label: isZh ? '冷色调' : 'Cool' },
        { value: 'warm', label: isZh ? '暖色调' : 'Warm' },
      ];

      const updateProgressSettings = (
        updater: (prev: ProgressCardSettings) => ProgressCardSettings
      ) => {
        handleUpdateSettings(card.instanceId, (prev) => {
          const base = prev?.progress ?? progressDefaults;
          const next = updater({ ...base });
          const normalizedScope: ProgressScope =
            next.scope === 'week' || next.scope === 'month' || next.scope === 'year'
              ? next.scope
              : 'day';
          const normalizedPalette: ProgressPalette = next.palette === 'warm' ? 'warm' : 'cool';
          const normalized: ProgressCardSettings = {
            scope: normalizedScope,
            palette: normalizedPalette,
          };
          const isDefault =
            normalized.scope === progressDefaults.scope &&
            (normalized.palette ?? 'cool') === progressDefaults.palette;
          if (isDefault) {
            if (!prev) return undefined;
            const { progress: _omit, ...rest } = prev;
            return Object.keys(rest).length ? rest : undefined;
          }
          return { ...(prev ?? {}), progress: normalized };
        });
      };

      renderCustomContent = () => (
        <div className="card-style-custom">
          <fieldset className="card-style-field">
            <legend className="card-style-field-label">{scopeLabel}</legend>
            <div className="card-style-radio-group">
              {scopeOptions.map((option) => (
                <label
                  key={option.value}
                  className={`card-style-choice${selectedScope === option.value ? ' is-selected' : ''}`}
                  htmlFor={`${card.instanceId}-progress-scope-${option.value}`}
                >
                  <input
                    id={`${card.instanceId}-progress-scope-${option.value}`}
                    className="card-style-choice-input"
                    type="radio"
                    name={`${card.instanceId}-progress-scope`}
                    value={option.value}
                    checked={selectedScope === option.value}
                    onChange={() => {
                      updateProgressSettings((prevProgress) => ({
                        ...prevProgress,
                        scope: option.value,
                      }));
                    }}
                  />
                  <span className="card-style-choice-marker" aria-hidden="true" />
                  <span className="card-style-choice-text">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="card-style-field">
            <legend className="card-style-field-label">{paletteLabel}</legend>
            <div className="card-style-radio-group">
              {paletteOptions.map((option) => (
                <label
                  key={option.value}
                  className={`card-style-choice${selectedPalette === option.value ? ' is-selected' : ''}`}
                  htmlFor={`${card.instanceId}-progress-palette-${option.value}`}
                >
                  <input
                    id={`${card.instanceId}-progress-palette-${option.value}`}
                    className="card-style-choice-input"
                    type="radio"
                    name={`${card.instanceId}-progress-palette`}
                    value={option.value}
                    checked={selectedPalette === option.value}
                    onChange={() => {
                      updateProgressSettings((prevProgress) => ({
                        ...prevProgress,
                        palette: option.value,
                      }));
                    }}
                  />
                  <span className="card-style-choice-marker" aria-hidden="true" />
                  <span className="card-style-choice-text">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      );
    }

    if (card.type === 'tips') {
      const tipsSettings = card.settings?.tips;
      const selectedSource = tipsSettings?.source ?? 'local';
      const sourceLabel = isZh ? '内容来源' : 'Content source';
      const localOptionLabel = isZh ? '护眼贴士' : 'Eye care tips';
      const hitokotoOptionLabel = isZh ? '一言' : 'Hitokoto';
      const tipsDefaults: TipsCardSettings = { source: 'local' };

      const updateTipsSettings = (
        updater: (prev: TipsCardSettings) => TipsCardSettings
      ) => {
        handleUpdateSettings(card.instanceId, (prev) => {
          const base = prev?.tips ?? tipsDefaults;
          const next = updater({ ...base });
          const normalized: TipsCardSettings =
            next.source === 'hitokoto' ? { source: 'hitokoto' } : { source: 'local' };
          if (normalized.source === 'local') {
            if (!prev) return undefined;
            const { tips: _omit, ...rest } = prev;
            return Object.keys(rest).length ? rest : undefined;
          }
          return { ...(prev ?? {}), tips: normalized };
        });
      };

      renderCustomContent = () => (
        <div className="card-style-custom">
          <fieldset className="card-style-field">
            <legend className="card-style-field-label">{sourceLabel}</legend>
            <div className="card-style-radio-group">
              <label
                className={`card-style-choice${selectedSource === 'local' ? ' is-selected' : ''}`}
                htmlFor={`${card.instanceId}-tips-source-local`}
              >
                <input
                  id={`${card.instanceId}-tips-source-local`}
                  className="card-style-choice-input"
                  type="radio"
                  name={`${card.instanceId}-tips-source`}
                  value="local"
                  checked={selectedSource === 'local'}
                  onChange={() => {
                    updateTipsSettings((prevTips) => ({ ...prevTips, source: 'local' }));
                  }}
                />
                <span className="card-style-choice-marker" aria-hidden="true" />
                <span className="card-style-choice-text">{localOptionLabel}</span>
              </label>
              <label
                className={`card-style-choice${selectedSource === 'hitokoto' ? ' is-selected' : ''}`}
                htmlFor={`${card.instanceId}-tips-source-hitokoto`}
              >
                <input
                  id={`${card.instanceId}-tips-source-hitokoto`}
                  className="card-style-choice-input"
                  type="radio"
                  name={`${card.instanceId}-tips-source`}
                  value="hitokoto"
                  checked={selectedSource === 'hitokoto'}
                  onChange={() => {
                    updateTipsSettings((prevTips) => ({ ...prevTips, source: 'hitokoto' }));
                  }}
                />
                <span className="card-style-choice-marker" aria-hidden="true" />
                <span className="card-style-choice-text">{hitokotoOptionLabel}</span>
              </label>
            </div>
          </fieldset>
        </div>
      );
    }

    return (
      <DraggableCard
        key={card.instanceId}
        id={card.instanceId}
        item={card.layout}
        minW={config.minW}
        minH={config.minH}
        metrics={metrics}
        onChange={attemptUpdate}
        onRemove={handleRemoveCard}
        removeLabel={removeLabel}
        styleOptions={CARD_STYLE_PRESETS[card.type]}
        selectedStyleId={card.styleId ?? null}
        onSelectStyle={handleSelectStyle}
        noStyleLabel={noStyleLabel}
        resetStyleLabel={resetStyleLabel}
        styleModalTitle={styleModalTitle}
        styleModalCloseLabel={styleModalCloseLabel}
        renderCustomContent={renderCustomContent}
        isInteractive={!isReadOnly}
        isActionable={isActionable}
      >
        {config.render(card, delay)}
      </DraggableCard>
    );
  });

  return (
    <div className={`dashboard-page${isReadOnly ? ' is-readonly' : ''}`}>
      <div className="dashboard-content">
        {!isReadOnly && (
          <div className="dashboard-toolbar">
            <button
              ref={addButtonRef}
              type="button"
              className="dashboard-add-button"
              onClick={() => setAddMenuOpen((open) => !open)}
              aria-haspopup="true"
              aria-expanded={isAddMenuOpen}
              aria-label={isZh ? '添加卡片' : 'Add card'}
            >
              +
            </button>
            {isAddMenuOpen && (
              <div className="dashboard-add-menu" ref={addMenuRef} role="menu">
                {CARD_ORDER.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="dashboard-add-menu-item"
                    onClick={() => {
                      handleAddCard(type);
                      setAddMenuOpen(false);
                    }}
                    role="menuitem"
                  >
                    {cardLabels[type]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="dashboard-grid" ref={gridRef} role="list" style={gridStyle}>
          {renderedCards}
        </div>
      </div>
    </div>
  );
}

interface DraggableCardProps {
  id: string;
  item: LayoutItem;
  minW: number;
  minH: number;
  metrics: GridMetrics;
  children: ReactNode;
  onChange: (id: string, candidate: LayoutItem) => boolean;
  onRemove: (id: string) => void;
  removeLabel: string;
  styleOptions: CardStylePreset[];
  selectedStyleId: string | null;
  onSelectStyle: (id: string, styleId: string | null) => void;
  noStyleLabel: string;
  resetStyleLabel: string;
  styleModalTitle: string;
  styleModalCloseLabel: string;
  renderCustomContent?: (close: () => void) => ReactNode;
  isInteractive?: boolean;
  isActionable?: boolean;
}

function DraggableCard({
  id,
  item,
  metrics,
  children,
  onChange,
  onRemove,
  removeLabel,
  styleOptions,
  selectedStyleId,
  onSelectStyle,
  noStyleLabel,
  resetStyleLabel,
  styleModalTitle,
  styleModalCloseLabel,
  renderCustomContent,
  minW,
  minH,
  isInteractive = true,
  isActionable = false,
}: DraggableCardProps) {
  const [mode, setMode] = useState<'idle' | 'dragging' | 'resizing'>('idle');
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const styleMenuRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dragIntentRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const previousBodyStylesRef = useRef<{ overflow: string; paddingRight: string } | null>(null);

  const closeStyleMenu = useCallback(() => {
    setStyleMenuOpen(false);
    dragIntentRef.current = false;
  }, []);

  useEffect(() => {
    if (!styleMenuOpen) return;
    if (typeof window === 'undefined') return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const bodyStyle = document.body.style;
    previousBodyStylesRef.current = {
      overflow: bodyStyle.overflow,
      paddingRight: bodyStyle.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      bodyStyle.paddingRight = `${scrollbarWidth}px`;
    }
    bodyStyle.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeStyleMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const focusable = styleMenuRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), select, input:not([disabled])'
    );
    focusable?.focus();
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const body = document.body.style;
      const previous = previousBodyStylesRef.current;
      if (previous) {
        body.overflow = previous.overflow;
        body.paddingRight = previous.paddingRight;
      }
      previousBodyStylesRef.current = null;
      previousFocusRef.current?.focus?.();
    };
  }, [closeStyleMenu, styleMenuOpen]);

  const applyWithBounds = useCallback(
    (candidate: LayoutItem) => {
      const normalized = {
        x: candidate.x,
        y: candidate.y,
        w: Math.max(minW, candidate.w),
        h: Math.max(minH, candidate.h),
      };
      if (
        !Number.isFinite(normalized.x) ||
        !Number.isFinite(normalized.y) ||
        !Number.isFinite(normalized.w) ||
        !Number.isFinite(normalized.h)
      ) {
        return;
      }
      onChange(id, normalized);
    },
    [id, minH, minW, onChange]
  );

  const handleDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (mode !== 'idle') return;
      if (metrics.columnSpan <= 0 || metrics.rowSpan <= 0) return;
      if (event.button !== 0) return;
      event.preventDefault();

      closeStyleMenu();

      const node = event.currentTarget;
      node.setPointerCapture(event.pointerId);
      setMode('dragging');

      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        original: { ...item },
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - start.pointerX;
        const deltaY = moveEvent.clientY - start.pointerY;

        const next: LayoutItem = {
          x: Math.round(start.original.x + deltaX / metrics.columnSpan),
          y: Math.round(start.original.y + deltaY / metrics.rowSpan),
          w: start.original.w,
          h: start.original.h,
        };

        if (
          !dragIntentRef.current &&
          (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)
        ) {
          dragIntentRef.current = true;
        }

        applyWithBounds(next);
      };

      const handleEnd = () => {
        node.removeEventListener('pointermove', handleMove);
        node.removeEventListener('pointerup', handleEnd);
        node.removeEventListener('pointercancel', handleEnd);
        try {
          node.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* ignore */
        }
        setMode('idle');
        if (!dragIntentRef.current) {
          setStyleMenuOpen(true);
        }
      };

      node.addEventListener('pointermove', handleMove);
      node.addEventListener('pointerup', handleEnd, { once: true });
      node.addEventListener('pointercancel', handleEnd, { once: true });
    },
    [applyWithBounds, closeStyleMenu, item, metrics, mode]
  );

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (metrics.columnSpan <= 0 || metrics.rowSpan <= 0) return;

      const node = event.currentTarget;
      node.setPointerCapture(event.pointerId);
      setMode('resizing');

      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        original: { ...item },
      };

      const handleMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - start.pointerX;
        const deltaY = moveEvent.clientY - start.pointerY;

        const next: LayoutItem = {
          x: start.original.x,
          y: start.original.y,
          w: Math.round(start.original.w + deltaX / metrics.columnSpan),
          h: Math.round(start.original.h + deltaY / metrics.rowSpan),
        };

        applyWithBounds(next);
      };

      const handleEnd = () => {
        node.removeEventListener('pointermove', handleMove);
        node.removeEventListener('pointerup', handleEnd);
        node.removeEventListener('pointercancel', handleEnd);
        try {
          node.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* ignore */
        }
        setMode('idle');
      };

      node.addEventListener('pointermove', handleMove);
      node.addEventListener('pointerup', handleEnd, { once: true });
      node.addEventListener('pointercancel', handleEnd, { once: true });
    },
    [applyWithBounds, item, metrics]
  );

  const classes = useMemo(() => {
    const base = ['draggable-card'];
    if (mode === 'dragging') base.push('is-dragging');
    if (mode === 'resizing') base.push('is-resizing');
    if (isActionable) base.push('is-actionable');
    return base.join(' ');
  }, [isActionable, mode]);

  const hasStyleOptions = styleOptions.length > 0;
  const hasCustomContent = typeof renderCustomContent === 'function';

  return (
    <div
      ref={cardRef}
      className={classes}
      onPointerDown={isInteractive ? handleDragStart : undefined}
      style={{
        gridColumnStart: item.x + 1,
        gridColumnEnd: `span ${Math.max(minW, item.w)}`,
        gridRowStart: item.y + 1,
        gridRowEnd: `span ${Math.max(minH, item.h)}`,
        touchAction: isInteractive ? 'none' : 'auto',
      }}
    >
      {isInteractive && (
        <button
          type="button"
          className="card-remove-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove(id);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          aria-label={removeLabel}
        >
          ×
        </button>
      )}
      {isInteractive && styleMenuOpen && (
        <div
          className="card-style-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-style-title`}
          onClick={closeStyleMenu}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div
            className="card-style-modal"
            ref={styleMenuRef}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card-style-modal-header">
              <h2 className="card-style-modal-title" id={`${id}-style-title`}>
                {styleModalTitle}
              </h2>
              <button
                type="button"
                className="card-style-modal-close"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  closeStyleMenu();
                }}
                aria-label={styleModalCloseLabel}
              >
                ×
              </button>
            </div>
            <div className="card-style-modal-body">
              {hasCustomContent && (
                <div className="card-style-custom-wrapper">
                  {renderCustomContent?.(closeStyleMenu)}
                </div>
              )}
              {hasStyleOptions && (
                <div className="card-style-menu-group">
                  <button
                    type="button"
                    className={`card-style-menu-item${selectedStyleId ? '' : ' is-active'}`}
                    onClick={() => {
                      onSelectStyle(id, null);
                      closeStyleMenu();
                    }}
                  >
                    {resetStyleLabel}
                  </button>
                  {styleOptions.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      className={`card-style-menu-item${selectedStyleId === style.id ? ' is-active' : ''}`}
                      onClick={() => {
                        onSelectStyle(id, style.id);
                        closeStyleMenu();
                      }}
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              )}
              {!hasStyleOptions && !hasCustomContent && (
                <div className="card-style-menu-empty">{noStyleLabel}</div>
              )}
            </div>
          </div>
        </div>
      )}
      {children}
      {isInteractive && (
        <div className="card-resize-handle" aria-hidden="true" onPointerDown={handleResizeStart} />
      )}
    </div>
  );
}

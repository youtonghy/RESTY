/**
 * Application-wide type definitions
 */

export type Theme = 'light' | 'dark' | 'auto';
export type Language = 'en-US' | 'en-GB' | 'zh-CN' | 'zh-TW';
export type ReminderMode = 'fullscreen' | 'floating';
export type FloatingPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type TimerPhase = 'work' | 'break' | 'idle';
export type TimerState = 'running' | 'paused' | 'stopped';

/**
 * Settings configuration structure
 */
export interface Settings {
  // Timer settings
  workDuration: number; // in minutes
  breakDuration: number; // in minutes
  enableForceBreak: boolean;
  flowModeEnabled: boolean;

  // Reminder settings
  reminderMode: ReminderMode;
  floatingPosition: FloatingPosition;
  opacity: number; // 0-100
  playSound: boolean;
  restMusicEnabled: boolean;
  restMusicDirectory: string;

  // Appearance
  theme: Theme;

  // System
  autostart: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;

  // Language
  language: Language;

  // Metadata
  version: string;
  updatedAt: string;
}

/**
 * Remote manifest metadata used for update checks.
 */
export interface UpdateManifest {
  name: string;
  version: string;
  author: string;
  website: string;
  downloadUrl?: string;
  notes?: string;
}

/**
 * Work/Break session record
 */
export interface Session {
  id: string;
  type: 'work' | 'break';
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  duration: number; // actual duration in seconds
  plannedDuration: number; // planned duration in seconds
  isSkipped: boolean;
  extendedSeconds: number;
  notes?: string;
}

/**
 * Timer state for UI display
 */
export interface TimerInfo {
  phase: TimerPhase;
  state: TimerState;
  remainingMinutes: number;
  totalMinutes: number;
  nextTransitionTime: string | null;
  // 下一次真正“开始休息”的时间（UTC ISO 字符串），若不可预测则为 null
  nextBreakTime?: string | null;
}

/**
 * Analytics data structure
 */
export interface AnalyticsData {
  totalWorkSeconds: number;
  totalBreakSeconds: number;
  breakCount: number;
  completedBreaks: number;
  skippedBreaks: number;
  sessions: Session[];
}

/**
 * Analytics query parameters
 */
export interface AnalyticsQuery {
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
}

/**
 * Monitor information
 */
export interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

/**
 * System status
 */
export interface SystemStatus {
  isFullscreen: boolean;
  isDoNotDisturb: boolean;
}

/**
 * Default settings values
 */
export const DEFAULT_SETTINGS: Settings = {
  workDuration: 25,
  breakDuration: 5,
  enableForceBreak: false,
  flowModeEnabled: false,
  reminderMode: 'fullscreen',
  floatingPosition: 'top-right',
  opacity: 95,
  playSound: true,
  restMusicEnabled: false,
  restMusicDirectory: '',
  theme: 'auto',
  autostart: false,
  minimizeToTray: true,
  closeToTray: true,
  language: 'en-US',
  version: '0.1.0',
  updatedAt: new Date().toISOString(),
};

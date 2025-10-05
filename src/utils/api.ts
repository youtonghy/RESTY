import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  Settings,
  TimerInfo,
  AnalyticsData,
  AnalyticsQuery,
  MonitorInfo,
  SystemStatus,
} from '../types';

/**
 * API service for communicating with Rust backend
 */

// Settings commands
export async function loadSettings(): Promise<Settings> {
  return await invoke('load_settings');
}

export async function saveSettings(settings: Settings): Promise<void> {
  return await invoke('save_settings', { settings });
}

// Timer commands
export async function startWork(): Promise<void> {
  return await invoke('start_work');
}

export async function startBreak(): Promise<void> {
  return await invoke('start_break');
}

export async function pauseTimer(): Promise<void> {
  return await invoke('pause_timer');
}

export async function resumeTimer(): Promise<void> {
  return await invoke('resume_timer');
}

export async function skipPhase(): Promise<void> {
  return await invoke('skip_phase');
}

export async function extendPhase(): Promise<void> {
  return await invoke('extend_phase');
}

export async function getTimerInfo(): Promise<TimerInfo> {
  return await invoke('get_timer_info');
}

// Analytics commands
export async function getAnalytics(query: AnalyticsQuery): Promise<AnalyticsData> {
  return await invoke('get_analytics', { query });
}

// Config commands
export async function importConfig(jsonStr: string): Promise<Settings> {
  return await invoke('import_config', { jsonStr });
}

export async function exportConfig(): Promise<string> {
  return await invoke('export_config');
}

// Monitor commands
export async function getMonitors(): Promise<MonitorInfo[]> {
  return await invoke('get_monitors');
}

// System commands
export async function getSystemStatus(): Promise<SystemStatus> {
  return await invoke('get_system_status');
}

// Window commands
export async function openReminderWindow(fullscreen: boolean): Promise<void> {
  return await invoke('open_reminder_window', { fullscreen });
}

export async function closeReminderWindow(): Promise<void> {
  return await invoke('close_reminder_window');
}

// Event listeners
export async function onTimerUpdate(callback: (info: TimerInfo) => void) {
  return await listen<TimerInfo>('timer-update', (event) => callback(event.payload));
}

export async function onPhaseChange(callback: (phase: string) => void) {
  return await listen<string>('phase-change', (event) => callback(event.payload));
}

export async function onTimerFinished(callback: () => void) {
  return await listen('timer-finished', () => callback());
}

export async function onSettingsChange(callback: (settings: Settings) => void) {
  return await listen<Settings>('settings-change', (event) => callback(event.payload));
}

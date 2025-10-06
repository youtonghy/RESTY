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
 * 前端与 Tauri Rust 层通信的统一封装。
 * 所有 invoke 与事件监听在此集中管理，业务组件只需调用这些函数即可。
 */

// Settings commands
/** 从本地持久化加载设置。 */
export async function loadSettings(): Promise<Settings> {
  return await invoke('load_settings');
}

/** 保存设置到后端与磁盘。 */
export async function saveSettings(settings: Settings): Promise<void> {
  return await invoke('save_settings', { settings });
}

// Timer commands
/** 开始一轮工作计时。 */
export async function startWork(): Promise<void> {
  return await invoke('start_work');
}

/** 手动进入休息阶段。 */
export async function startBreak(): Promise<void> {
  return await invoke('start_break');
}

/** 暂停当前倒计时。 */
export async function pauseTimer(): Promise<void> {
  return await invoke('pause_timer');
}

/** 恢复被暂停的倒计时。 */
export async function resumeTimer(): Promise<void> {
  return await invoke('resume_timer');
}

/** 跳过当前阶段并记录会话。 */
export async function skipPhase(): Promise<void> {
  return await invoke('skip_phase');
}

/** 延长当前阶段 5 分钟（默认逻辑在后端完成）。 */
export async function extendPhase(): Promise<void> {
  return await invoke('extend_phase');
}

/** 获取最新计时器状态，常用于应用初始化。 */
export async function getTimerInfo(): Promise<TimerInfo> {
  return await invoke('get_timer_info');
}

// Analytics commands
/** 按时间区间获取统计数据。 */
export async function getAnalytics(query: AnalyticsQuery): Promise<AnalyticsData> {
  return await invoke('get_analytics', { query });
}

// Config commands
/** 导入 JSON 配置。 */
export async function importConfig(jsonStr: string): Promise<Settings> {
  return await invoke('import_config', { jsonStr });
}

/** 导出当前配置为 JSON 字符串。 */
export async function exportConfig(): Promise<string> {
  return await invoke('export_config');
}

// Monitor commands
/** 获取显示器信息（当前为占位实现）。 */
export async function getMonitors(): Promise<MonitorInfo[]> {
  return await invoke('get_monitors');
}

// System commands
/** 读取系统状态信息（勿扰模式、全屏等）。 */
export async function getSystemStatus(): Promise<SystemStatus> {
  return await invoke('get_system_status');
}

// Window commands
/** 打开提醒窗口，支持全屏或浮窗模式。 */
export async function openReminderWindow(fullscreen: boolean): Promise<void> {
  return await invoke('open_reminder_window', { fullscreen });
}

/** 关闭提醒窗口。 */
export async function closeReminderWindow(): Promise<void> {
  return await invoke('close_reminder_window');
}

// Event listeners
/** 订阅计时器状态更新事件。 */
export async function onTimerUpdate(callback: (info: TimerInfo) => void) {
  return await listen<TimerInfo>('timer-update', (event) => callback(event.payload));
}

/** 订阅阶段切换事件（工作 <-> 休息）。 */
export async function onPhaseChange(callback: (phase: string) => void) {
  return await listen<string>('phase-change', (event) => callback(event.payload));
}

/** 订阅计时结束事件，可用于播放提示音等二次动作。 */
export async function onTimerFinished(callback: () => void) {
  return await listen('timer-finished', () => callback());
}

/** 订阅设置变更事件，确保多窗口间配置保持一致。 */
export async function onSettingsChange(callback: (settings: Settings) => void) {
  return await listen<Settings>('settings-change', (event) => callback(event.payload));
}

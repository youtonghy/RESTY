import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  AchievementUnlock,
  Settings,
  TimerInfo,
  AnalyticsData,
  AnalyticsQuery,
  FloatingPosition,
  MonitorInfo,
  SystemStatus,
  SessionsBounds,
  Session,
  UpdateManifest,
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

/** 获取会话数据的时间范围（用于分页等场景）。 */
export async function getSessionsBounds(): Promise<SessionsBounds> {
  return await invoke('get_sessions_bounds');
}

/** 清除统计数据（会话记录）。 */
export async function clearAnalyticsData(): Promise<void> {
  return await invoke('clear_analytics_data');
}

// Achievements commands
/** 获取已解锁成就列表。 */
export async function getAchievements(): Promise<AchievementUnlock[]> {
  return await invoke('get_achievements');
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

// Data transfer commands
/** 导出设置与统计数据到指定路径。 */
export async function exportAppDataToFile(path: string): Promise<void> {
  return await invoke('export_app_data_to_file', { path });
}

/** 从指定路径导入设置与统计数据。 */
export async function importAppDataFromFile(path: string): Promise<Settings> {
  return await invoke('import_app_data_from_file', { path });
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

// Rest music commands
/** 列出休息音乐目录中的音频文件路径。 */
export async function getRestMusicFiles(): Promise<string[]> {
  return await invoke('get_rest_music_files');
}

// Autostart plugin commands (via Tauri v2 plugin)
/** 检查是否已启用开机自启（兼容不同命令命名）。 */
export async function isAutostartEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>('plugin:autostart|isEnabled');
  } catch (_) {
    try {
      // v1 风格命名回退
      return await invoke<boolean>('plugin:autostart|is_enabled');
    } catch (err) {
      console.warn('isAutostartEnabled failed:', err);
      return false;
    }
  }
}

/** 启用开机自启。 */
export async function enableAutostart(): Promise<void> {
  await invoke('plugin:autostart|enable');
}

/** 禁用开机自启。 */
export async function disableAutostart(): Promise<void> {
  await invoke('plugin:autostart|disable');
}

/** 根据布尔值同步开机自启状态。 */
export async function setAutostart(enabled: boolean): Promise<void> {
  try {
    const current = await isAutostartEnabled();
    if (enabled && !current) {
      await enableAutostart();
    } else if (!enabled && current) {
      await disableAutostart();
    }
  } catch (err) {
    console.error('setAutostart failed:', err);
  }
}

// Window commands
/** 打开提醒窗口，支持全屏或浮窗模式。 */
export async function openReminderWindow(
  fullscreen: boolean,
  floatingPosition?: FloatingPosition
): Promise<void> {
  return await invoke('open_reminder_window', { fullscreen, floatingPosition });
}

/** 关闭提醒窗口。 */
export async function closeReminderWindow(): Promise<void> {
  return await invoke('close_reminder_window');
}

/** 前端准备好后显示提醒窗口（避免白屏闪烁）。 */
export async function showReminderWindow(): Promise<void> {
  return await invoke('show_reminder_window');
}

/** 显示主窗口（用于前端初始化完成后调用）。 */
export async function showMainWindow(): Promise<void> {
  return await invoke('show_main_window');
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

/** 订阅从托盘触发的“打开设置”事件，用于路由跳转。 */
export async function onOpenSettings(callback: () => void) {
  return await listen('open-settings', () => callback());
}

/** 订阅会话写入/更新事件（用于统计页面实时刷新）。 */
export async function onSessionUpserted(callback: (session: Session) => void) {
  return await listen<Session>('session-upserted', (event) => callback(event.payload));
}

/** 订阅成就解锁事件。 */
export async function onAchievementUnlocked(callback: (achievement: AchievementUnlock) => void) {
  return await listen<AchievementUnlock>('achievement-unlocked', (event) => callback(event.payload));
}

// Update commands
/** 获取最新发布的元数据。 */
export async function checkForUpdates(): Promise<UpdateManifest | null> {
  return await invoke<UpdateManifest | null>('check_for_updates');
}

/** 下载并触发静默安装更新。 */
export async function downloadAndInstall(url: string): Promise<void> {
  return await invoke('download_and_install_update', { url });
}

// Network proxy commands
/** 获取贴士引用文案（后端代理）。 */
export async function fetchTipQuote(language: string): Promise<string | null> {
  return await invoke('fetch_tip_quote', { language });
}

/** 加载翻译资源（后端代理）。 */
export async function loadTranslation(language: string): Promise<Record<string, unknown>> {
  return await invoke('load_translation', { language });
}

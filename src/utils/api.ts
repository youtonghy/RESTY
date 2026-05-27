import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { debugError, debugLog } from './debug';
import type {
  AchievementUnlock,
  Settings,
  TimerInfo,
  AnalyticsData,
  AnalyticsQuery,
  SessionsBounds,
  Session,
  UpdateManifest,
} from '../types';

const SLOW_COMMAND_MS = 500;
const PENDING_COMMAND_MS = 1_000;

const invokeWithDebug = async <T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> => {
  const startedAt = performance.now();
  const pendingTimer = window.setTimeout(() => {
    debugLog('api', `${command} still pending`, {
      durationMs: Math.round(performance.now() - startedAt),
      args,
    });
  }, PENDING_COMMAND_MS);

  try {
    const result = await invoke<T>(command, args);
    const durationMs = Math.round(performance.now() - startedAt);
    if (durationMs >= SLOW_COMMAND_MS) {
      debugLog('api', `${command} resolved slowly`, { durationMs, args });
    }
    return result;
  } catch (error) {
    debugError('api', `${command} failed`, {
      durationMs: Math.round(performance.now() - startedAt),
      args,
      error,
    });
    throw error;
  } finally {
    window.clearTimeout(pendingTimer);
  }
};

/**
 * 前端与 Tauri Rust 层通信的统一封装。
 * 所有 invoke 与事件监听在这里集中管理，业务组件只调用这些函数。
 */

// Settings commands
/** 从本地持久化加载设置。 */
export async function loadSettings(): Promise<Settings> {
  return await invokeWithDebug('load_settings');
}

/** 保存设置到后端与磁盘。 */
export async function saveSettings(settings: Settings): Promise<void> {
  return await invokeWithDebug('save_settings', { settings });
}

// Timer commands
/** 开始一轮工作计时。 */
export async function startWork(): Promise<void> {
  return await invokeWithDebug('start_work');
}

/** 手动进入休息阶段。 */
export async function startBreak(): Promise<void> {
  return await invokeWithDebug('start_break');
}

/** 暂停当前倒计时。 */
export async function pauseTimer(): Promise<void> {
  return await invokeWithDebug('pause_timer');
}

/** 恢复被暂停的倒计时。 */
export async function resumeTimer(): Promise<void> {
  return await invokeWithDebug('resume_timer');
}

/** 跳过当前阶段并记录会话。 */
export async function skipPhase(): Promise<void> {
  return await invokeWithDebug('skip_phase');
}

/** 延长当前阶段 5 分钟。 */
export async function extendPhase(): Promise<void> {
  return await invokeWithDebug('extend_phase');
}

/** 获取最新计时器状态。 */
export async function getTimerInfo(): Promise<TimerInfo> {
  return await invokeWithDebug('get_timer_info');
}

// Analytics commands
/** 按时间区间获取统计数据。 */
export async function getAnalytics(query: AnalyticsQuery): Promise<AnalyticsData> {
  return await invokeWithDebug('get_analytics', { query });
}

/** 获取会话数据的时间范围。 */
export async function getSessionsBounds(): Promise<SessionsBounds> {
  return await invokeWithDebug('get_sessions_bounds');
}

/** 清除统计会话数据。 */
export async function clearAnalyticsData(): Promise<void> {
  return await invokeWithDebug('clear_analytics_data');
}

// Achievements commands
/** 获取已解锁成就列表。 */
export async function getAchievements(): Promise<AchievementUnlock[]> {
  return await invokeWithDebug('get_achievements');
}

// Config commands
/** 导入 JSON 配置。 */
export async function importConfig(jsonStr: string): Promise<Settings> {
  return await invokeWithDebug('import_config', { jsonStr });
}

/** 导出当前配置为 JSON 字符串。 */
export async function exportConfig(): Promise<string> {
  return await invokeWithDebug('export_config');
}

// Data transfer commands
/** 导出设置与统计数据到指定路径。 */
export async function exportAppDataToFile(path: string): Promise<void> {
  return await invokeWithDebug('export_app_data_to_file', { path });
}

/** 从指定路径导入设置与统计数据。 */
export async function importAppDataFromFile(path: string): Promise<Settings> {
  return await invokeWithDebug('import_app_data_from_file', { path });
}

// Rest music commands
/** 列出休息音乐目录中的音频文件路径。 */
export async function getRestMusicFiles(): Promise<string[]> {
  return await invokeWithDebug('get_rest_music_files');
}

// Autostart plugin commands (via Tauri v2 plugin)
/** 检查是否已启用开机自启。 */
export async function isAutostartEnabled(): Promise<boolean> {
  try {
    return await invokeWithDebug<boolean>('plugin:autostart|isEnabled');
  } catch (_) {
    try {
      // Tauri v1 风格命名回退。
      return await invokeWithDebug<boolean>('plugin:autostart|is_enabled');
    } catch (err) {
      console.warn('isAutostartEnabled failed:', err);
      return false;
    }
  }
}

/** 启用开机自启。 */
export async function enableAutostart(): Promise<void> {
  await invokeWithDebug('plugin:autostart|enable');
}

/** 禁用开机自启。 */
export async function disableAutostart(): Promise<void> {
  await invokeWithDebug('plugin:autostart|disable');
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
/** 关闭提醒窗口。 */
export async function closeReminderWindow(): Promise<void> {
  return await invokeWithDebug('close_reminder_window');
}

/** 打开休息前提醒窗口。 */
export async function openPreBreakReminderWindow(): Promise<void> {
  return await invokeWithDebug('open_pre_break_reminder_window');
}

/** 关闭休息前提醒窗口。 */
export async function closePreBreakReminderWindow(): Promise<void> {
  return await invokeWithDebug('close_pre_break_reminder_window');
}

/** 显示主窗口。 */
export async function showMainWindow(): Promise<void> {
  return await invokeWithDebug('show_main_window');
}

// Event listeners
/** 订阅计时器状态更新事件。 */
export async function onTimerUpdate(callback: (info: TimerInfo) => void) {
  return await listen<TimerInfo>('timer-update', (event) => callback(event.payload));
}

/** 订阅设置变更事件，确保多窗口配置保持一致。 */
export async function onSettingsChange(callback: (settings: Settings) => void) {
  return await listen<Settings>('settings-change', (event) => callback(event.payload));
}

/** 订阅从托盘触发的打开设置事件。 */
export async function onOpenSettings(callback: () => void) {
  return await listen('open-settings', () => callback());
}

/** 订阅会话写入/更新事件。 */
export async function onSessionUpserted(callback: (session: Session) => void) {
  return await listen<Session>('session-upserted', (event) => callback(event.payload));
}

/** 订阅成就解锁事件。 */
export async function onAchievementUnlocked(callback: (achievement: AchievementUnlock) => void) {
  return await listen<AchievementUnlock>('achievement-unlocked', (event) => callback(event.payload));
}

// Update commands
/** 获取最新发布元数据。 */
export async function checkForUpdates(): Promise<UpdateManifest | null> {
  return await invokeWithDebug<UpdateManifest | null>('check_for_updates');
}

/** 下载并触发静默安装更新。 */
export async function installUpdate(): Promise<void> {
  return await invokeWithDebug('install_update');
}

// Network proxy commands
/** 获取贴士引用文案。 */
export async function fetchTipQuote(language: string): Promise<string | null> {
  return await invokeWithDebug('fetch_tip_quote', { language });
}

/** 加载翻译资源。 */
export async function loadTranslation(language: string): Promise<Record<string, unknown>> {
  return await invokeWithDebug('load_translation', { language });
}

export async function sendPreBreakToast(
  title: string,
  body: string,
  dismissLabel: string,
  breakNowLabel: string
): Promise<void> {
  return await invokeWithDebug('send_pre_break_toast', {
    title,
    body,
    dismissLabel,
    breakNowLabel,
  });
}

export async function onPreBreakAction(callback: (actionId: string) => void) {
  return await listen<string>('pre-break-action', (event) => callback(event.payload));
}

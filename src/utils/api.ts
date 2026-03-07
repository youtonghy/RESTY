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
 * 鍓嶇涓?Tauri Rust 灞傞€氫俊鐨勭粺涓€灏佽銆? * 鎵€鏈?invoke 涓庝簨浠剁洃鍚湪姝ら泦涓鐞嗭紝涓氬姟缁勪欢鍙渶璋冪敤杩欎簺鍑芥暟鍗冲彲銆? */

// Settings commands
/** 浠庢湰鍦版寔涔呭寲鍔犺浇璁剧疆銆?*/
export async function loadSettings(): Promise<Settings> {
  return await invoke('load_settings');
}

/** 淇濆瓨璁剧疆鍒板悗绔笌纾佺洏銆?*/
export async function saveSettings(settings: Settings): Promise<void> {
  return await invoke('save_settings', { settings });
}

// Timer commands
/** 寮€濮嬩竴杞伐浣滆鏃躲€?*/
export async function startWork(): Promise<void> {
  return await invoke('start_work');
}

/** 鎵嬪姩杩涘叆浼戞伅闃舵銆?*/
export async function startBreak(): Promise<void> {
  return await invoke('start_break');
}

/** 鏆傚仠褰撳墠鍊掕鏃躲€?*/
export async function pauseTimer(): Promise<void> {
  return await invoke('pause_timer');
}

/** 鎭㈠琚殏鍋滅殑鍊掕鏃躲€?*/
export async function resumeTimer(): Promise<void> {
  return await invoke('resume_timer');
}

/** 璺宠繃褰撳墠闃舵骞惰褰曚細璇濄€?*/
export async function skipPhase(): Promise<void> {
  return await invoke('skip_phase');
}

/** 寤堕暱褰撳墠闃舵 5 鍒嗛挓锛堥粯璁ら€昏緫鍦ㄥ悗绔畬鎴愶級銆?*/
export async function extendPhase(): Promise<void> {
  return await invoke('extend_phase');
}

/** 鑾峰彇鏈€鏂拌鏃跺櫒鐘舵€侊紝甯哥敤浜庡簲鐢ㄥ垵濮嬪寲銆?*/
export async function getTimerInfo(): Promise<TimerInfo> {
  return await invoke('get_timer_info');
}

// Analytics commands
/** 鎸夋椂闂村尯闂磋幏鍙栫粺璁℃暟鎹€?*/
export async function getAnalytics(query: AnalyticsQuery): Promise<AnalyticsData> {
  return await invoke('get_analytics', { query });
}

/** 鑾峰彇浼氳瘽鏁版嵁鐨勬椂闂磋寖鍥达紙鐢ㄤ簬鍒嗛〉绛夊満鏅級銆?*/
export async function getSessionsBounds(): Promise<SessionsBounds> {
  return await invoke('get_sessions_bounds');
}

/** 娓呴櫎缁熻鏁版嵁锛堜細璇濊褰曪級銆?*/
export async function clearAnalyticsData(): Promise<void> {
  return await invoke('clear_analytics_data');
}

// Achievements commands
/** 鑾峰彇宸茶В閿佹垚灏卞垪琛ㄣ€?*/
export async function getAchievements(): Promise<AchievementUnlock[]> {
  return await invoke('get_achievements');
}

// Config commands
/** 瀵煎叆 JSON 閰嶇疆銆?*/
export async function importConfig(jsonStr: string): Promise<Settings> {
  return await invoke('import_config', { jsonStr });
}

/** 瀵煎嚭褰撳墠閰嶇疆涓?JSON 瀛楃涓层€?*/
export async function exportConfig(): Promise<string> {
  return await invoke('export_config');
}

// Data transfer commands
/** 瀵煎嚭璁剧疆涓庣粺璁℃暟鎹埌鎸囧畾璺緞銆?*/
export async function exportAppDataToFile(path: string): Promise<void> {
  return await invoke('export_app_data_to_file', { path });
}

/** 浠庢寚瀹氳矾寰勫鍏ヨ缃笌缁熻鏁版嵁銆?*/
export async function importAppDataFromFile(path: string): Promise<Settings> {
  return await invoke('import_app_data_from_file', { path });
}

// Monitor commands
/** 鑾峰彇鏄剧ず鍣ㄤ俊鎭紙褰撳墠涓哄崰浣嶅疄鐜帮級銆?*/
export async function getMonitors(): Promise<MonitorInfo[]> {
  return await invoke('get_monitors');
}

// System commands
/** 璇诲彇绯荤粺鐘舵€佷俊鎭紙鍕挎壈妯″紡銆佸叏灞忕瓑锛夈€?*/
export async function getSystemStatus(): Promise<SystemStatus> {
  return await invoke('get_system_status');
}

// Rest music commands
/** 鍒楀嚭浼戞伅闊充箰鐩綍涓殑闊抽鏂囦欢璺緞銆?*/
export async function getRestMusicFiles(): Promise<string[]> {
  return await invoke('get_rest_music_files');
}

// Autostart plugin commands (via Tauri v2 plugin)
/** 妫€鏌ユ槸鍚﹀凡鍚敤寮€鏈鸿嚜鍚紙鍏煎涓嶅悓鍛戒护鍛藉悕锛夈€?*/
export async function isAutostartEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>('plugin:autostart|isEnabled');
  } catch (_) {
    try {
      // v1 椋庢牸鍛藉悕鍥為€€
      return await invoke<boolean>('plugin:autostart|is_enabled');
    } catch (err) {
      console.warn('isAutostartEnabled failed:', err);
      return false;
    }
  }
}

/** 鍚敤寮€鏈鸿嚜鍚€?*/
export async function enableAutostart(): Promise<void> {
  await invoke('plugin:autostart|enable');
}

/** 绂佺敤寮€鏈鸿嚜鍚€?*/
export async function disableAutostart(): Promise<void> {
  await invoke('plugin:autostart|disable');
}

/** 鏍规嵁甯冨皵鍊煎悓姝ュ紑鏈鸿嚜鍚姸鎬併€?*/
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
/** 鎵撳紑鎻愰啋绐楀彛锛屾敮鎸佸叏灞忔垨娴獥妯″紡銆?*/
export async function openReminderWindow(
  fullscreen: boolean,
  floatingPosition?: FloatingPosition
): Promise<void> {
  return await invoke('open_reminder_window', { fullscreen, floatingPosition });
}

/** 鍏抽棴鎻愰啋绐楀彛銆?*/
export async function closeReminderWindow(): Promise<void> {
  return await invoke('close_reminder_window');
}

/** 鍓嶇鍑嗗濂藉悗鏄剧ず鎻愰啋绐楀彛锛堥伩鍏嶇櫧灞忛棯鐑侊級銆?*/
export async function showReminderWindow(): Promise<void> {
  return await invoke('show_reminder_window');
}

/** 鏄剧ず涓荤獥鍙ｏ紙鐢ㄤ簬鍓嶇鍒濆鍖栧畬鎴愬悗璋冪敤锛夈€?*/
export async function showMainWindow(): Promise<void> {
  return await invoke('show_main_window');
}

// Event listeners
/** 璁㈤槄璁℃椂鍣ㄧ姸鎬佹洿鏂颁簨浠躲€?*/
export async function onTimerUpdate(callback: (info: TimerInfo) => void) {
  return await listen<TimerInfo>('timer-update', (event) => callback(event.payload));
}

/** 璁㈤槄闃舵鍒囨崲浜嬩欢锛堝伐浣?<-> 浼戞伅锛夈€?*/
export async function onPhaseChange(callback: (phase: string) => void) {
  return await listen<string>('phase-change', (event) => callback(event.payload));
}

/** 璁㈤槄璁℃椂缁撴潫浜嬩欢锛屽彲鐢ㄤ簬鎾斁鎻愮ず闊崇瓑浜屾鍔ㄤ綔銆?*/
export async function onTimerFinished(callback: () => void) {
  return await listen('timer-finished', () => callback());
}

/** 璁㈤槄璁剧疆鍙樻洿浜嬩欢锛岀‘淇濆绐楀彛闂撮厤缃繚鎸佷竴鑷淬€?*/
export async function onSettingsChange(callback: (settings: Settings) => void) {
  return await listen<Settings>('settings-change', (event) => callback(event.payload));
}

/** 璁㈤槄浠庢墭鐩樿Е鍙戠殑鈥滄墦寮€璁剧疆鈥濅簨浠讹紝鐢ㄤ簬璺敱璺宠浆銆?*/
export async function onOpenSettings(callback: () => void) {
  return await listen('open-settings', () => callback());
}

/** 璁㈤槄浼氳瘽鍐欏叆/鏇存柊浜嬩欢锛堢敤浜庣粺璁￠〉闈㈠疄鏃跺埛鏂帮級銆?*/
export async function onSessionUpserted(callback: (session: Session) => void) {
  return await listen<Session>('session-upserted', (event) => callback(event.payload));
}

/** 璁㈤槄鎴愬氨瑙ｉ攣浜嬩欢銆?*/
export async function onAchievementUnlocked(callback: (achievement: AchievementUnlock) => void) {
  return await listen<AchievementUnlock>('achievement-unlocked', (event) => callback(event.payload));
}

// Update commands
/** 鑾峰彇鏈€鏂板彂甯冪殑鍏冩暟鎹€?*/
export async function checkForUpdates(): Promise<UpdateManifest | null> {
  return await invoke<UpdateManifest | null>('check_for_updates');
}

/** 涓嬭浇骞惰Е鍙戦潤榛樺畨瑁呮洿鏂般€?*/
export async function installUpdate(): Promise<void> {
  return await invoke('install_update');
}

// Network proxy commands
/** 鑾峰彇璐村＋寮曠敤鏂囨锛堝悗绔唬鐞嗭級銆?*/
export async function fetchTipQuote(language: string): Promise<string | null> {
  return await invoke('fetch_tip_quote', { language });
}

/** 鍔犺浇缈昏瘧璧勬簮锛堝悗绔唬鐞嗭級銆?*/
export async function loadTranslation(language: string): Promise<Record<string, unknown>> {
  return await invoke('load_translation', { language });
}
import { invoke } from '@tauri-apps/api/core';

/**
 * 更新托盘图标的主题图标。
 * 在非 Tauri 环境下调用会静默失败。
 */
export async function updateTrayIconTheme(theme: 'light' | 'dark'): Promise<void> {
  try {
    await invoke('update_tray_icon_theme', { theme });
  } catch (error) {
    console.warn('Failed to update tray icon theme:', error);
  }
}

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

const isTauri = typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri) {
    return false;
  }

  try {
    if (await isPermissionGranted()) {
      return true;
    }

    const permission = await requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.warn('Failed to request notification permission:', error);
    return false;
  }
}

export async function notifyAchievementUnlocked(title: string, body: string): Promise<void> {
  if (!(await ensureNotificationPermission())) {
    return;
  }

  try {
    sendNotification({ title, body });
  } catch (error) {
    console.warn('Failed to send achievement notification:', error);
  }
}

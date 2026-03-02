import {
  isPermissionGranted,
  removeActive,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

const isTauri = typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
const PRE_BREAK_NOTIFICATION_ID = 10001;

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

export async function notifyRestStartsSoon(title: string, body: string): Promise<void> {
  if (!(await ensureNotificationPermission())) {
    return;
  }

  try {
    sendNotification({ id: PRE_BREAK_NOTIFICATION_ID, title, body });
  } catch (error) {
    console.warn('Failed to send pre-break notification:', error);
  }
}

export async function clearRestStartsSoonNotification(): Promise<void> {
  if (!isTauri) {
    return;
  }

  try {
    await removeActive([{ id: PRE_BREAK_NOTIFICATION_ID }]);
  } catch (error) {
    console.warn('Failed to clear pre-break notification:', error);
  }
}

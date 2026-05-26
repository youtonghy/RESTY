import {
  isPermissionGranted,
  removeActive,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import * as api from '../utils/api';

const isTauri = typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
const PRE_BREAK_NOTIFICATION_ID = 10001;
const PRE_BREAK_AUTO_DISMISS_MS = 10_000;

type PreBreakNotificationMode = 'plain' | 'actions';

const isWindowsPlatform = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = `${navigator.userAgent} ${navigator.platform ?? ''}`.toLowerCase();
  return ua.includes('win');
})();

let preBreakDismissTimer: ReturnType<typeof setTimeout> | null = null;
let nativeToastAvailable = isWindowsPlatform && isTauri;

function clearPreBreakAutoDismissTimer() {
  if (preBreakDismissTimer) {
    clearTimeout(preBreakDismissTimer);
    preBreakDismissTimer = null;
  }
}

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

export async function notifyRestStartsSoon(
  title: string,
  body: string,
  actionLabels?: { dismiss: string; breakNow: string },
  mode: PreBreakNotificationMode = actionLabels ? 'actions' : 'plain'
): Promise<void> {
  if (!(await ensureNotificationPermission())) {
    return;
  }

  // Prefer Windows native Toast (with real action buttons) when available.
  if (mode === 'actions' && nativeToastAvailable && actionLabels) {
    try {
      await api.sendPreBreakToast(title, body, actionLabels.dismiss, actionLabels.breakNow);
      clearPreBreakAutoDismissTimer();
      preBreakDismissTimer = setTimeout(() => {
        preBreakDismissTimer = null;
      }, PRE_BREAK_AUTO_DISMISS_MS);
      return;
    } catch (error) {
      console.warn('Windows native toast failed, falling back to plugin notification:', error);
      nativeToastAvailable = false;
    }
  }

  try {
    clearPreBreakAutoDismissTimer();

    sendNotification({
      id: PRE_BREAK_NOTIFICATION_ID,
      title,
      body,
    });

    preBreakDismissTimer = setTimeout(() => {
      preBreakDismissTimer = null;
      void clearRestStartsSoonNotification();
    }, PRE_BREAK_AUTO_DISMISS_MS);
  } catch (error) {
    console.warn('Failed to send pre-break notification:', error);
  }
}

export async function clearRestStartsSoonNotification(): Promise<void> {
  if (!isTauri) {
    return;
  }

  clearPreBreakAutoDismissTimer();

  try {
    await removeActive([{ id: PRE_BREAK_NOTIFICATION_ID }]);
  } catch (error) {
    console.warn('Failed to clear pre-break notification:', error);
  }
}

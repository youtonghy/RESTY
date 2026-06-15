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

export type NotificationPermissionStatus =
  | 'unknown'
  | 'granted'
  | 'notGranted'
  | 'unsupported'
  | 'error';

export type NotificationSendResult =
  | 'sent'
  | 'permissionMissing'
  | 'unsupported'
  | 'failed';

type PreBreakNotificationMode = 'plain' | 'actions';

const isWindowsPlatform = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = `${navigator.userAgent} ${navigator.platform ?? ''}`.toLowerCase();
  return ua.includes('win');
})();

const isMacOSPlatform = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = `${navigator.userAgent} ${navigator.platform ?? ''}`.toLowerCase();
  return ua.includes('macintosh') || ua.includes('mac os x') || ua.includes('macos');
})();

let preBreakDismissTimer: ReturnType<typeof setTimeout> | null = null;
let nativeToastAvailable = isWindowsPlatform && isTauri;

function clearPreBreakAutoDismissTimer() {
  if (preBreakDismissTimer) {
    clearTimeout(preBreakDismissTimer);
    preBreakDismissTimer = null;
  }
}

const normalizeNotificationPermission = (
  permission: NotificationPermission
): NotificationPermissionStatus => (permission === 'granted' ? 'granted' : 'notGranted');

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isTauri) {
    return 'unsupported';
  }

  try {
    return (await isPermissionGranted()) ? 'granted' : 'notGranted';
  } catch (error) {
    console.warn('Failed to check notification permission:', error);
    return 'error';
  }
}

export async function requestNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isTauri) {
    return 'unsupported';
  }

  try {
    if (await isPermissionGranted()) {
      return 'granted';
    }

    return normalizeNotificationPermission(await requestPermission());
  } catch (error) {
    console.warn('Failed to request notification permission:', error);
    return 'error';
  }
}

async function ensureNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  if (!isTauri) {
    return 'unsupported';
  }

  try {
    if (await isPermissionGranted()) {
      return 'granted';
    }

    if (isMacOSPlatform) {
      return 'notGranted';
    }

    const permission = await requestPermission();
    return normalizeNotificationPermission(permission);
  } catch (error) {
    console.warn('Failed to request notification permission:', error);
    return 'error';
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  return (await ensureNotificationPermissionStatus()) === 'granted';
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
): Promise<NotificationSendResult> {
  const permissionStatus = await ensureNotificationPermissionStatus();
  if (permissionStatus !== 'granted') {
    return permissionStatus === 'unsupported'
      ? 'unsupported'
      : permissionStatus === 'error'
        ? 'failed'
        : 'permissionMissing';
  }

  // Prefer Windows native Toast (with real action buttons) when available.
  if (mode === 'actions' && nativeToastAvailable && actionLabels) {
    try {
      await api.sendPreBreakToast(title, body, actionLabels.dismiss, actionLabels.breakNow);
      clearPreBreakAutoDismissTimer();
      preBreakDismissTimer = setTimeout(() => {
        preBreakDismissTimer = null;
      }, PRE_BREAK_AUTO_DISMISS_MS);
      return 'sent';
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
    return 'sent';
  } catch (error) {
    console.warn('Failed to send pre-break notification:', error);
    return 'failed';
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

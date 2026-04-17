import {
  isPermissionGranted,
  onAction,
  registerActionTypes,
  removeActive,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import type { PluginListener } from '@tauri-apps/api/core';
import * as api from '../utils/api';

const isTauri = typeof window !== 'undefined' && Boolean((window as { __TAURI__?: unknown }).__TAURI__);
const PRE_BREAK_NOTIFICATION_ID = 10001;
const PRE_BREAK_ACTION_TYPE_ID = 'resty-pre-break';
const PRE_BREAK_DISMISS_ACTION_ID = 'dismiss';
const PRE_BREAK_BREAK_NOW_ACTION_ID = 'break-now';
const PRE_BREAK_AUTO_DISMISS_MS = 10_000;

const isWindowsPlatform = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = `${navigator.userAgent} ${navigator.platform ?? ''}`.toLowerCase();
  return ua.includes('win');
})();

let preBreakDismissTimer: ReturnType<typeof setTimeout> | null = null;
let preBreakActionTypeRegistered = false;
let nativeToastAvailable = isWindowsPlatform && isTauri;

export type PreBreakActionId = 'dismiss' | 'break-now';

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
  actionLabels?: { dismiss: string; breakNow: string }
): Promise<void> {
  if (!(await ensureNotificationPermission())) {
    return;
  }

  // Prefer Windows native Toast (with real action buttons) when available.
  if (nativeToastAvailable && actionLabels) {
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
    if (actionLabels) {
      await ensurePreBreakActionTypeRegistered(actionLabels);
    }

    clearPreBreakAutoDismissTimer();

    sendNotification({
      id: PRE_BREAK_NOTIFICATION_ID,
      title,
      body,
      actionTypeId: actionLabels ? PRE_BREAK_ACTION_TYPE_ID : undefined,
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

async function ensurePreBreakActionTypeRegistered(labels: {
  dismiss: string;
  breakNow: string;
}): Promise<void> {
  if (preBreakActionTypeRegistered) return;

  try {
    await registerActionTypes([
      {
        id: PRE_BREAK_ACTION_TYPE_ID,
        actions: [
          {
            id: PRE_BREAK_DISMISS_ACTION_ID,
            title: labels.dismiss,
          },
          {
            id: PRE_BREAK_BREAK_NOW_ACTION_ID,
            title: labels.breakNow,
            foreground: true,
          },
        ],
      },
    ]);
    preBreakActionTypeRegistered = true;
  } catch (error) {
    console.warn('Failed to register pre-break notification actions:', error);
  }
}

export async function listenPreBreakNotificationAction(
  handler: (actionId: PreBreakActionId) => void
): Promise<PluginListener | null> {
  if (!isTauri) {
    return null;
  }

  try {
    return await onAction((notification) => {
      const extra = (notification as { actionId?: unknown }).actionId;
      if (typeof extra !== 'string') return;
      if (extra === PRE_BREAK_DISMISS_ACTION_ID) {
        handler('dismiss');
      } else if (extra === PRE_BREAK_BREAK_NOW_ACTION_ID) {
        handler('break-now');
      }
    });
  } catch (error) {
    console.warn('Failed to register pre-break action listener:', error);
    return null;
  }
}

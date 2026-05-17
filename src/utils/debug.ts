import { invoke } from '@tauri-apps/api/core';

type DebugLevel = 'info' | 'warn' | 'error';

declare global {
  interface Window {
    __RESTY_DEBUG_HOOKS_INSTALLED__?: boolean;
  }
}

const isDev = import.meta.env.DEV;

const normalizeDetails = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
};

const sendToBackend = (
  level: DebugLevel,
  scope: string,
  message: string,
  details?: unknown
) => {
  if (!isDev) return;

  void invoke('debug_log', {
    level,
    scope,
    message,
    details: details === undefined ? null : normalizeDetails(details),
  }).catch(() => {
    // The backend command is only for local debugging; never let logging break the app.
  });
};

export const debugLog = (scope: string, message: string, details?: unknown) => {
  if (!isDev) return;
  console.info(`[RESTY][${scope}] ${message}`, details ?? '');
  sendToBackend('info', scope, message, details);
};

export const debugWarn = (scope: string, message: string, details?: unknown) => {
  if (!isDev) return;
  console.warn(`[RESTY][${scope}] ${message}`, details ?? '');
  sendToBackend('warn', scope, message, details);
};

export const debugError = (scope: string, message: string, details?: unknown) => {
  if (!isDev) return;
  console.error(`[RESTY][${scope}] ${message}`, details ?? '');
  sendToBackend('error', scope, message, details);
};

export const installFrontendDebugHooks = () => {
  if (!isDev || typeof window === 'undefined') return;
  if (window.__RESTY_DEBUG_HOOKS_INSTALLED__) return;

  window.__RESTY_DEBUG_HOOKS_INSTALLED__ = true;
  debugLog('app', 'frontend debug hooks installed', {
    href: window.location.href,
    userAgent: window.navigator.userAgent,
  });

  window.addEventListener('error', (event) => {
    debugError('window.error', event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      error: event.error,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    debugError('window.unhandledrejection', 'Unhandled promise rejection', {
      reason: event.reason,
    });
  });
};

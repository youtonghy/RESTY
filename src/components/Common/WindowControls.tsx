import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Custom window control buttons for borderless Tauri window.
 */
export function WindowControls() {
  const appWindow = getCurrentWindow();
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // Initialize state
    appWindow.isMaximized().then(setIsMax).catch(() => {});

    // Try to update on resize (best-effort; not critical if unavailable)
    // @ts-expect-error Tauri v2 exposes onResized; fallback if runtime lacks it
    if (typeof appWindow.onResized === 'function') {
      // @ts-ignore
      appWindow.onResized?.(() => {
        appWindow.isMaximized().then(setIsMax).catch(() => {});
      }).then((off: () => void) => {
        unlisten = off;
      }).catch(() => {});
    }
    return () => {
      try { unlisten && unlisten(); } catch { /* ignore */ }
    };
  }, []);

  const minimize = async () => {
    try { await appWindow.minimize(); } catch {}
  };

  const toggleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
      const v = await appWindow.isMaximized();
      setIsMax(v);
    } catch {}
  };

  const close = async () => {
    try { await appWindow.close(); } catch {}
  };

  return (
    <div className="window-controls">
      <button
        className="window-button minimize"
        title="Minimize"
        onClick={minimize}
      >
        {/* icon: minimize */}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="1.5" y="4.75" width="7" height="0.75" rx="0.375" fill="currentColor" />
        </svg>
      </button>
      <button
        className="window-button maximize"
        title={isMax ? 'Restore' : 'Maximize'}
        onClick={toggleMaximize}
      >
        {isMax ? (
          // Restore icon
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 2.5h4.5v4.5H3z" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M2.5 3v4.5H7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          // Maximize icon
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button
        className="window-button close"
        title="Close"
        onClick={close}
      >
        {/* icon: close */}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}


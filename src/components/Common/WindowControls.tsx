import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Custom window control buttons for borderless Tauri window.
 * Colors: red (close), yellow (minimize), green (fullscreen)
 */
export function WindowControls() {
  const appWindow = getCurrentWindow();
  const [isFull, setIsFull] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // Initialize state
    appWindow.isFullscreen().then(setIsFull).catch(() => {});

    // Best-effort: update state when window resizes
    const winAny = appWindow as unknown as { onResized?: (cb: () => void) => Promise<() => void> };
    winAny.onResized?.(() => {
      appWindow.isFullscreen().then(setIsFull).catch(() => {});
    })
      .then((off) => {
        unlisten = off;
      })
      .catch(() => {});

    return () => {
      try {
        unlisten && unlisten();
      } catch {}
    };
  }, []);

  const minimize = async () => {
    try {
      await appWindow.minimize();
    } catch {}
  };

  const toggleFullscreen = async () => {
    try {
      await appWindow.setFullscreen(!isFull);
      setIsFull(!isFull);
    } catch {}
  };

  const close = async () => {
    try {
      await appWindow.close();
    } catch {}
  };

  return (
    <div className="window-controls">
      {/* Order: Yellow (minimize), Green (full screen), Red (close) */}
      <button className="window-button minimize" title="最小化" onClick={minimize}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <rect x="1.5" y="4.75" width="7" height="0.75" rx="0.375" fill="currentColor" />
        </svg>
      </button>
      <button
        className="window-button fullscreen"
        title={isFull ? '退出全屏' : '全屏'}
        onClick={toggleFullscreen}
      >
        {isFull ? (
          // Restore icon
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M3 2.5h4.5v4.5H3z" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M2.5 3v4.5H7" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          // Fullscreen icon (maximize square)
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect x="2" y="2" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button className="window-button close" title="关闭" onClick={close}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}


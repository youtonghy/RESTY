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

  const fullscreenLabel = isFull ? '退出全屏' : '全屏';

  return (
    <div className="window-controls">
      {/* Order: Yellow (minimize), Green (full screen), Red (close) */}
      <button
        className="window-button minimize"
        title="最小化"
        aria-label="最小化"
        onClick={minimize}
      />
      <button
        className="window-button fullscreen"
        title={fullscreenLabel}
        aria-label={fullscreenLabel}
        onClick={toggleFullscreen}
      />
      <button className="window-button close" title="关闭" aria-label="关闭" onClick={close} />
    </div>
  );
}

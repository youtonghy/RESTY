import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Custom window control buttons for borderless Tauri window.
 * Colors: red (close), yellow (minimize), green (maximize)
 */
export function WindowControls() {
  const appWindow = getCurrentWindow();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    // Initialize state
    appWindow.isMaximized().then(setIsMaximized).catch(() => {});

    // Best-effort: update state when window resizes
    const winAny = appWindow as unknown as { onResized?: (cb: () => void) => Promise<() => void> };
    winAny.onResized?.(() => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {});
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

  const toggleMaximize = async () => {
    try {
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
      setIsMaximized(!isMaximized);
    } catch {}
  };

  const close = async () => {
    try {
      await appWindow.close();
    } catch {}
  };

  const maximizeLabel = isMaximized ? '还原' : '最大化';

  return (
    <div className="window-controls">
      {/* Order: Yellow (minimize), Green (maximize), Red (close) */}
      <button
        className="window-button minimize"
        title="最小化"
        aria-label="最小化"
        onClick={minimize}
      />
      <button
        className="window-button maximize"
        title={maximizeLabel}
        aria-label={maximizeLabel}
        onClick={toggleMaximize}
      />
      <button className="window-button close" title="关闭" aria-label="关闭" onClick={close} />
    </div>
  );
}

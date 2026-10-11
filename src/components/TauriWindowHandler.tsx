'use client';

import { useEffect } from 'react';

// The part of the global Tauri API this component uses.
interface TauriGlobal {
  window: {
    getCurrentWindow: () => { show: () => Promise<void> };
  };
}

export function TauriWindowHandler() {
  useEffect(() => {
    // Check if we are running inside Tauri
    const tauri = (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__;
    if (tauri) {
      try {
        const appWindow = tauri.window.getCurrentWindow();

        // Wait a small frame for React DOM hydration/layout to paint, then show window
        requestAnimationFrame(() => {
          setTimeout(() => {
            appWindow.show().catch((err: unknown) => {
              console.error('Failed to show window via show() promise:', err);
            });
          }, 100);
        });
      } catch (err) {
        console.error('Failed to get current Tauri window:', err);
      }
    }
  }, []);

  return null;
}

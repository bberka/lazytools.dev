'use client';

import { useEffect } from 'react';

export function TauriWindowHandler() {
  useEffect(() => {
    // Check if we are running inside Tauri
    if (typeof window !== 'undefined' && (window as any).__TAURI__) {
      try {
        const { getCurrentWindow } = (window as any).__TAURI__.window;
        const appWindow = getCurrentWindow();
        
        // Wait a small frame for React DOM hydration/layout to paint, then show window
        requestAnimationFrame(() => {
          setTimeout(() => {
            appWindow.show().catch((err: any) => {
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

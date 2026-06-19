'use client';

import { useEffect } from 'react';

export function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister().then((success) => {
            if (success) {
              console.log('[PWA] Unregistered active service worker for development mode');
              window.location.reload();
            }
          });
        }
      });
      return;
    }

    const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(
      window.location.hostname
    );
    const canRegister =
      window.location.protocol === 'https:' || isLocalhost;

    if (!canRegister) {
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration can fail in private browsing or unsupported local setups.
    });
  }, []);

  return null;
}

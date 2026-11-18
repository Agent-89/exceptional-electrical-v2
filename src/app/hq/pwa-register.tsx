'use client';

import { useEffect } from 'react';

/** Registers the office HQ-scoped service worker. */
export default function HQPwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
        .register('/hq/sw.js?v=hq-v4', { scope: '/hq/' })
      .catch((error) => console.warn('HQ offline worker unavailable', error));
  }, []);
  return null;
}

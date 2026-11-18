'use client';

import { useEffect } from 'react';

/** Registers the Field-scoped service worker. */
export default function FieldPwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/field/sw.js?v=field-v2', { scope: '/field/' })
      .catch((error) => console.warn('Field offline worker unavailable', error));
  }, []);
  return null;
}

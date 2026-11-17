'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Registers the shared HQ-scope service worker once.
 * Manifest link comes from layout metadata (HQ vs nested Field layout).
 */
export default function HQPwaRegister() {
  const pathname = usePathname() || '';
  const surface = pathname.startsWith('/hq/tech') ? 'field' : 'hq';

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const version = surface === 'field' ? 'field-v1' : 'hq-v1';
    navigator.serviceWorker
      .register(`/hq/sw.js?surface=${surface}&v=${version}`, { scope: '/hq/' })
      .catch((error) => console.warn('HQ offline worker unavailable', error));
  }, [surface]);

  return null;
}

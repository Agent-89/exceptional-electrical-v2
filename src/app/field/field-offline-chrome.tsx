'use client';

import { useCallback, useEffect, useState } from 'react';
import { countOutboxItems } from '@/lib/field-offline/db';
import { flushFieldOutbox } from '@/lib/field-offline/sync';

/**
 * Offline status banner + outbox flush for Field surfaces.
 * Mount once under /field (via tech layout wrapper).
 */
export default function FieldOfflineChrome() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshPending = useCallback(async () => {
    try {
      setPending(await countOutboxItems());
    } catch {
      setPending(0);
    }
  }, []);

  const runSync = useCallback(async () => {
    if (!navigator.onLine || syncing) return;
    setSyncing(true);
    setMessage(null);
    try {
      const result = await flushFieldOutbox();
      await refreshPending();
      if (result.flushed > 0 && result.remaining === 0) {
        setMessage(`Synced ${result.flushed} offline change${result.flushed === 1 ? '' : 's'}.`);
      } else if (result.failed > 0) {
        setMessage(result.lastError || 'Some offline changes could not sync. Retry when online.');
      }
    } catch {
      setMessage('Unable to sync offline changes right now.');
    } finally {
      setSyncing(false);
    }
  }, [refreshPending, syncing]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refreshPending();
    const onOnline = () => {
      setOnline(true);
      void runSync();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void runSync();
    };
    const onOutbox = () => {
      void refreshPending();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('ee-field-outbox-changed', onOutbox);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('ee-field-outbox-changed', onOutbox);
    };
  }, [refreshPending, runSync]);

  if (online && pending === 0 && !message) return null;

  return (
    <div
      className={`ee-tech-offline-banner${online ? '' : ' is-offline'}`}
      role="status"
      aria-live="polite"
    >
      {!online ? (
        <span>You’re offline · timer and notes will sync when you’re back online. Photos need a signal.</span>
      ) : pending > 0 ? (
        <span>
          {syncing ? 'Syncing offline changes…' : `${pending} offline change${pending === 1 ? '' : 's'} waiting to sync.`}{' '}
          {!syncing ? (
            <button type="button" onClick={() => void runSync()}>
              Sync now
            </button>
          ) : null}
        </span>
      ) : message ? (
        <span>{message}</span>
      ) : null}
    </div>
  );
}

export function notifyFieldOutboxChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('ee-field-outbox-changed'));
}

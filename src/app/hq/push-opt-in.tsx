'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  deleteHqPushSubscription,
  getHqPushSubscriptionStatus,
  saveHqPushSubscription,
} from './push-actions';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function isStandaloneDisplay(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type Status = 'loading' | 'unsupported' | 'needs_install' | 'off' | 'on' | 'disabled';

/**
 * Office-only opt-in for enquiry Web Push on the installed HQ PWA.
 */
export default function HqPushOptIn() {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setStatus('unsupported');
        return;
      }
      if (!vapidPublicKey) {
        if (!cancelled) setStatus('disabled');
        return;
      }
      try {
        const server = await getHqPushSubscriptionStatus();
        if (cancelled) return;
        if (!server.enabled) {
          setStatus('disabled');
          return;
        }
        if (!isStandaloneDisplay() && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
          setStatus('needs_install');
          return;
        }
        const registration = await withTimeout(navigator.serviceWorker.ready, 8000);
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setStatus(existing || server.subscribed ? 'on' : 'off');
      } catch {
        if (!cancelled) setStatus('off');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  const enable = () => {
    setMessage('');
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          setMessage('Notifications were blocked for this device.');
          return;
        }
        const registration = await withTimeout(navigator.serviceWorker.ready, 8000);
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
        });
        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          setMessage('Could not create a push subscription.');
          return;
        }
        const result = await saveHqPushSubscription({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          userAgent: navigator.userAgent.slice(0, 400),
        });
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        setStatus('on');
        setMessage('Notifications enabled on this device.');
      } catch (error) {
        console.warn('HQ push subscribe failed', error);
        setMessage('Could not enable notifications on this device.');
      }
    });
  };

  const disable = () => {
    setMessage('');
    startTransition(async () => {
      try {
        const registration = await withTimeout(navigator.serviceWorker.ready, 8000);
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await deleteHqPushSubscription(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setStatus('off');
        setMessage('Notifications turned off on this device.');
      } catch {
        setMessage('Could not turn off notifications.');
      }
    });
  };

  return (
    <div className="hq-push-opt-in">
      <strong>Enquiry alerts</strong>
      {status === 'loading' ? (
        <p>Checking notification settings…</p>
      ) : status === 'unsupported' ? (
        <p>This browser does not support push notifications.</p>
      ) : status === 'disabled' ? (
        <p>Push alerts are not enabled on this environment yet.</p>
      ) : status === 'needs_install' ? (
        <p>
          On iPhone/iPad, open the installed Home Screen HQ app (not Safari) to enable push alerts.
        </p>
      ) : (
        <>
          <p>
            {status === 'on'
              ? 'This device will notify you when website or phone enquiries arrive.'
              : 'Get a push when a new website or phone enquiry lands in HQ.'}
          </p>
          {status === 'on' ? (
            <button type="button" disabled={pending} onClick={disable}>
              Turn off on this device
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={enable}>
              Enable on this device
            </button>
          )}
        </>
      )}
      {message ? <small>{message}</small> : null}
      <style>{`
        .hq-push-opt-in{flex-shrink:0;margin-top:14px;padding-top:14px;border-top:1px solid #e1eaf1}
        .hq-push-opt-in strong{display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#607e93}
        .hq-push-opt-in p{margin:8px 0 0;font-size:13px;line-height:1.4;color:#476579;font-weight:500}
        .hq-push-opt-in button{margin-top:10px;border:1px solid #d1e1ef;background:#fff;border-radius:8px;padding:8px 11px;color:#0877c7;font-size:13px;font-weight:700;cursor:pointer}
        .hq-push-opt-in button:disabled{opacity:.6;cursor:default}
        .hq-push-opt-in small{display:block;margin-top:8px;color:#607e93;font-size:12px}
      `}</style>
    </div>
  );
}

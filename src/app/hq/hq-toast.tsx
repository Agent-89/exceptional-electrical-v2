'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type HqToastTone = 'success' | 'error';
export type HqToastMessage = { id: number; tone: HqToastTone; text: string };

type Props = {
  toast: HqToastMessage | null;
  onDismiss: () => void;
  /** Visible hold time before exit animation. Errors default longer. */
  durationMs?: number;
};

const EXIT_MS = 220;

export default function HqToast({ toast, onDismiss, durationMs }: Props) {
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const holdMs = durationMs ?? (toast?.tone === 'error' ? 4500 : 2500);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!toast) {
      setLeaving(false);
      return;
    }
    setLeaving(false);
    const hold = window.setTimeout(() => setLeaving(true), holdMs);
    return () => window.clearTimeout(hold);
    // Only restart the hold when a new toast id appears — not on parent re-renders.
  }, [toast?.id, holdMs]);

  useEffect(() => {
    if (!toast || !leaving) return;
    const exit = window.setTimeout(() => onDismissRef.current(), EXIT_MS);
    return () => window.clearTimeout(exit);
  }, [toast?.id, leaving]);

  if (!mounted || !toast) return null;

  return createPortal(
    <div
      className={
        'hq-toast hq-toast-' + toast.tone + (leaving ? ' is-leaving' : '')
      }
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
    >
      <span>{toast.text}</span>
      <button
        type="button"
        className="hq-toast-dismiss"
        aria-label="Dismiss notification"
        onClick={() => onDismissRef.current()}
      >
        ×
      </button>
      <style jsx global>{`
        .hq-toast {
          position: fixed;
          left: 50%;
          bottom: calc(24px + env(safe-area-inset-bottom, 0px));
          transform: translateX(-50%);
          z-index: 2147483600;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          width: min(420px, calc(100vw - 24px));
          padding: 14px 16px;
          border-radius: 12px;
          box-shadow: 0 16px 40px #102c4240;
          font-size: 14px;
          line-height: 1.4;
          font-weight: 650;
          color: #fff;
          animation: hq-toast-in 0.22s ease;
        }
        .hq-toast.is-leaving {
          animation: hq-toast-out 0.22s ease forwards;
          pointer-events: none;
        }
        .hq-toast-success {
          background: #1f7a4d;
        }
        .hq-toast-error {
          background: #b42318;
        }
        .hq-toast-dismiss {
          border: 0;
          background: transparent;
          color: inherit;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          padding: 0 2px;
          margin: -2px 0 0 auto;
          opacity: 0.85;
        }
        @keyframes hq-toast-in {
          from {
            opacity: 0;
            transform: translate(-50%, 12px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
        @keyframes hq-toast-out {
          from {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          to {
            opacity: 0;
            transform: translate(-50%, 10px);
          }
        }
        @media (max-width: 760px) {
          .hq-toast {
            bottom: calc(
              var(--hq-shell-bottom-height, 64px) + 16px + env(safe-area-inset-bottom, 0px)
            );
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}

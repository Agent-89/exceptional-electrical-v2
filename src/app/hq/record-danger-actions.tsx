'use client';

import { MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type DangerAction = {
  id: string;
  label: string;
  confirm: string;
  disabled?: boolean;
  title?: string;
  run: () => Promise<{ ok: boolean; message: string }>;
  redirectTo?: string;
};

export default function RecordDangerActions({
  label = 'Record actions',
  actions,
}: {
  label?: string;
  actions: DangerAction[];
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        menuRef.current.open = false;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current) menuRef.current.open = false;
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!actions.length) return null;

  const blockedHints = actions
    .filter((action) => action.disabled && action.title)
    .map((action) => action.title as string);

  return (
    <details
      className="hq-record-actions-menu"
      ref={menuRef}
      onToggle={(event) => setOpen((event.target as HTMLDetailsElement).open)}
    >
      <summary aria-label={label} title={label}>
        <MoreHorizontal size={20} strokeWidth={2.2} aria-hidden="true" />
      </summary>
      <div className="hq-record-actions-panel" role="menu">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            className="hq-record-actions-danger"
            disabled={busy !== null || Boolean(action.disabled)}
            title={action.title}
            aria-disabled={Boolean(action.disabled)}
            onClick={async () => {
              if (action.disabled) {
                setError(action.title || 'This record cannot be deleted.');
                return;
              }
              if (!window.confirm(action.confirm)) return;
              setBusy(action.id);
              setError('');
              try {
                const result = await action.run();
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                if (menuRef.current) menuRef.current.open = false;
                if (action.redirectTo) {
                  router.push(action.redirectTo);
                }
                router.refresh();
              } catch {
                setError('Unable to complete that action.');
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === action.id ? 'Working…' : action.label}
          </button>
        ))}
        {!error && blockedHints.length > 0 ? (
          <p className="hq-record-actions-hint" role="note">
            {blockedHints.join(' ')}
          </p>
        ) : null}
        {error ? (
          <p className="hq-record-actions-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

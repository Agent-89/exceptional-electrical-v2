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
        {error ? (
          <p className="hq-record-actions-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <style jsx>{`
        .hq-record-actions-menu {
          position: relative;
          flex: 0 0 auto;
        }
        .hq-record-actions-menu > summary {
          list-style: none;
          cursor: pointer;
          border: 1px solid #c9dae8;
          border-radius: 10px;
          width: 40px;
          height: 40px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #17669e;
          background: #fff;
        }
        .hq-record-actions-menu > summary::-webkit-details-marker {
          display: none;
        }
        .hq-record-actions-menu[open] > summary {
          background: #eaf5ff;
          border-color: #0875bd;
          color: #0875bd;
        }
        .hq-record-actions-panel {
          position: absolute;
          right: 0;
          top: calc(100% + 6px);
          z-index: 40;
          min-width: 220px;
          display: grid;
          gap: 2px;
          padding: 6px;
          border: 1px solid #c7dce9;
          border-radius: 10px;
          background: #fff;
          box-shadow: 0 12px 28px #122b4420;
        }
        .hq-record-actions-panel > button {
          display: block;
          width: 100%;
          text-align: left;
          border: 0;
          background: transparent;
          padding: 10px 12px;
          border-radius: 7px;
          font: inherit;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .hq-record-actions-danger {
          color: #ad3b3b;
        }
        .hq-record-actions-danger:hover,
        .hq-record-actions-danger:focus-visible {
          background: #fdecec;
          outline: none;
        }
        .hq-record-actions-error {
          margin: 4px 0 0;
          padding: 8px 12px;
          font-size: 12px;
          line-height: 1.4;
          color: #b42318;
        }
      `}</style>
    </details>
  );
}

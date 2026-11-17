'use client';

import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function JobHeaderActions({
  statusLabel,
  statusForm,
}: {
  statusLabel: string;
  statusForm: ReactNode;
}) {
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<'menu' | 'status'>('menu');

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        menuRef.current.open = false;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current) {
        menuRef.current.open = false;
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="ee-job-header-actions">
      <span className="ee-workspace-status">{statusLabel}</span>

      <details
        className="ee-job-actions-menu"
        ref={menuRef}
        onToggle={(event) => {
          const open = (event.target as HTMLDetailsElement).open;
          setMenuOpen(open);
          if (!open) setPanel('menu');
        }}
      >
        <summary aria-label="Job actions" title="Job actions">
          <MoreHorizontal size={20} strokeWidth={2.2} aria-hidden="true" />
        </summary>

        <div className="ee-job-actions-panel" role={panel === 'menu' ? 'menu' : undefined}>
          {panel === 'menu' ? (
            <button type="button" role="menuitem" onClick={() => setPanel('status')}>
              Change status…
            </button>
          ) : (
            <div className="ee-job-status-panel">
              <div className="ee-job-status-form-head">
                <strong>Change status</strong>
                <button type="button" className="ee-text-action" onClick={() => setPanel('menu')}>
                  Back
                </button>
              </div>
              {statusForm}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}

'use client';

import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export default function JobHeaderActions({
  status,
  statusLabel,
  statusTone = 'neutral',
  statusForm,
}: {
  status: string;
  statusLabel: string;
  statusTone?: string;
  statusForm: ReactNode;
}) {
  const statusRef = useRef<HTMLDetailsElement | null>(null);
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const statusPanelId = useId();

  useEffect(() => {
    if (!statusOpen && !menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (statusOpen && statusRef.current && !statusRef.current.contains(target)) {
        statusRef.current.open = false;
      }
      if (menuOpen && menuRef.current && !menuRef.current.contains(target)) {
        menuRef.current.open = false;
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (statusRef.current?.open) statusRef.current.open = false;
      if (menuRef.current?.open) menuRef.current.open = false;
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, statusOpen]);

  return (
    <div className="ee-job-header-actions">
      <details
        className="ee-job-status-menu"
        ref={statusRef}
        onToggle={(event) => {
          const open = (event.target as HTMLDetailsElement).open;
          setStatusOpen(open);
          if (open && menuRef.current?.open) menuRef.current.open = false;
        }}
      >
        <summary
          className={`ee-workspace-status ee-workspace-status--${statusTone}`}
          aria-label={`Job status: ${statusLabel}. Change status`}
          title="Change status"
          data-status={status}
        >
          <span className="ee-workspace-status-dot" aria-hidden="true" />
          <span className="ee-workspace-status-label">{statusLabel}</span>
          <ChevronDown size={14} strokeWidth={2.4} aria-hidden="true" />
        </summary>
        <div className="ee-job-status-panel" id={statusPanelId} role="dialog" aria-label="Change status">
          <div className="ee-job-status-form-head">
            <strong>Change status</strong>
          </div>
          {statusForm}
        </div>
      </details>

      <details
        className="ee-job-actions-menu"
        ref={menuRef}
        onToggle={(event) => {
          const open = (event.target as HTMLDetailsElement).open;
          setMenuOpen(open);
          if (open && statusRef.current?.open) statusRef.current.open = false;
        }}
      >
        <summary aria-label="Job actions" title="Job actions">
          <MoreHorizontal size={20} strokeWidth={2.2} aria-hidden="true" />
        </summary>

        <div className="ee-job-actions-panel" role="menu">
          <p className="ee-job-actions-empty ee-muted">More job actions will appear here.</p>
        </div>
      </details>
    </div>
  );
}

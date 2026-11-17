'use client';

import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cancelJob, deleteEmptyJob } from '../actions';

export default function JobHeaderActions({
  jobId,
  status,
  statusLabel,
  statusTone = 'neutral',
  statusForm,
  canCancel = false,
  canDelete = false,
  deleteEligible = false,
  deleteBlockers = [],
}: {
  jobId: string;
  status: string;
  statusLabel: string;
  statusTone?: string;
  statusForm: ReactNode;
  canCancel?: boolean;
  canDelete?: boolean;
  deleteEligible?: boolean;
  deleteBlockers?: string[];
}) {
  const router = useRouter();
  const statusRef = useRef<HTMLDetailsElement | null>(null);
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<'cancel' | 'delete' | null>(null);
  const [error, setError] = useState('');
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

  const runCancel = async () => {
    if (
      !window.confirm(
        'Cancel this job? It will stay in the list as Cancelled and the job number will not be reused.',
      )
    ) {
      return;
    }
    setBusy('cancel');
    setError('');
    try {
      const result = await cancelJob(jobId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (menuRef.current) menuRef.current.open = false;
      router.refresh();
    } catch {
      setError('Unable to cancel job.');
    } finally {
      setBusy(null);
    }
  };

  const runDelete = async () => {
    if (!deleteEligible) {
      setError(deleteBlockers.length ? `Cannot delete: ${deleteBlockers.join('; ')}.` : 'This job cannot be deleted.');
      return;
    }
    if (
      !window.confirm(
        'Permanently delete this empty job? This cannot be undone. The job number will not be reused.',
      )
    ) {
      return;
    }
    setBusy('delete');
    setError('');
    try {
      const result = await deleteEmptyJob(jobId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push('/hq/jobs');
      router.refresh();
    } catch {
      setError('Unable to delete job.');
    } finally {
      setBusy(null);
    }
  };

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
          {canCancel && status !== 'cancelled' && status !== 'completed' ? (
            <button type="button" role="menuitem" disabled={busy !== null} onClick={runCancel}>
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel job'}
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              role="menuitem"
              className="ee-job-actions-danger"
              disabled={busy !== null || !deleteEligible}
              title={deleteEligible ? 'Permanently delete this empty job' : deleteBlockers.join('; ') || 'Not eligible for delete'}
              onClick={runDelete}
            >
              {busy === 'delete' ? 'Deleting…' : 'Delete job'}
            </button>
          ) : null}
          {!canCancel && !canDelete ? (
            <p className="ee-job-actions-empty ee-muted">No additional actions available.</p>
          ) : null}
          {error ? (
            <p className="ee-job-actions-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

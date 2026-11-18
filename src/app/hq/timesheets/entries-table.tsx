'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { reviewTimeEntryAction } from '@/app/field/actions';
import TimeEntryReviewForm from '@/app/hq/time-entry-review-form';
import { formatJobNumber, formatPerthDate, formatPerthTime } from '@/lib/perth-day';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import {
  allowedReviewDecisions,
  inferBillableMode,
  type ReviewTimeDecision,
} from '@/lib/review-time-entry';
import { jobTimeStatusLabel } from '@/lib/job-time-list';

export type TimesheetEntryRow = {
  id: string;
  jobId: string;
  staffId: string;
  staffName: string;
  jobNumber: number | null;
  jobTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
  status: string;
  entrySource: string;
  note: string | null;
  originalWorkedMinutes: number | null;
};

function canDecision(status: string, decision: ReviewTimeDecision): boolean {
  return allowedReviewDecisions(status).includes(decision);
}

export default function TimesheetEntriesTable({ entries }: { entries: TimesheetEntryRow[] }) {
  const router = useRouter();
  const rejectDialog = useRef<HTMLDialogElement>(null);
  const correctDialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TimesheetEntryRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [correctTarget, setCorrectTarget] = useState<TimesheetEntryRow | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const node = rejectDialog.current;
    if (!node) return;
    if (rejectTarget && !node.open) node.showModal();
    if (!rejectTarget && node.open) node.close();
  }, [rejectTarget]);

  useEffect(() => {
    const node = correctDialog.current;
    if (!node) return;
    if (correctTarget && !node.open) node.showModal();
    if (!correctTarget && node.open) node.close();
  }, [correctTarget]);

  const closeReject = useCallback(() => {
    setRejectTarget(null);
    setRejectReason('');
  }, []);

  const closeCorrect = useCallback(() => {
    setCorrectTarget(null);
  }, []);

  const runReview = useCallback(
    (entry: TimesheetEntryRow, decision: ReviewTimeDecision, extras?: { rejectionReason?: string }) => {
      if (pending && busyId) return;
      setBusyId(entry.id);
      setRowError(null);
      setFlash(null);

      const worked = entry.workedMinutes ?? 0;
      const billable = entry.billableMinutes ?? worked;
      const data = new FormData();
      data.set('entry_id', entry.id);
      data.set('decision', decision);
      data.set('billable_minutes', String(billable));
      data.set('billable_mode', inferBillableMode(entry.billableMinutes, entry.workedMinutes));
      data.set('rejection_reason', extras?.rejectionReason ?? '');
      data.set('started_at', '');
      data.set('ended_at', '');
      data.set('break_minutes', String(entry.breakMinutes));
      data.set('correction_note', '');

      startTransition(async () => {
        const result = await reviewTimeEntryAction(data);
        if (!result.ok) {
          setRowError({
            id: entry.id,
            message: result.error || 'Unable to save time review.',
          });
          setBusyId(null);
          return;
        }
        setFlash(result.message || (decision === 'approve' ? 'Time entry approved.' : 'Time entry rejected.'));
        setBusyId(null);
        if (decision === 'reject') closeReject();
        router.refresh();
      });
    },
    [pending, busyId, router, closeReject],
  );

  const submitReject = useCallback(() => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRowError({ id: rejectTarget.id, message: 'Rejection reason is required.' });
      return;
    }
    runReview(rejectTarget, 'reject', { rejectionReason: reason });
  }, [rejectTarget, rejectReason, runReview]);

  return (
    <section className="hq-panel ee-compact-panel">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">ENTRIES</span>
          <h2>
            {entries.length} individual {entries.length === 1 ? 'result' : 'results'}
          </h2>
        </div>
      </div>

      {flash ? (
        <p className="ee-form-success" role="status">
          {flash}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <p className="ee-muted">No time entries match these filters.</p>
      ) : (
        <div className="ee-job-table-wrap ee-timesheet-entries-wrap">
          <table className="ee-job-table ee-timesheet-entries-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Job</th>
                <th scope="col">Date</th>
                <th scope="col">Start</th>
                <th scope="col">End</th>
                <th scope="col">Break</th>
                <th scope="col">Worked</th>
                <th scope="col">Billable</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const canApprove = canDecision(entry.status, 'approve');
                const canReject = canDecision(entry.status, 'reject');
                const canCorrect = canDecision(entry.status, 'correct');
                const busy = busyId === entry.id && pending;
                return (
                  <tr
                    key={entry.id}
                    className={
                      entry.status === 'submitted' || entry.status === 'corrected'
                        ? 'ee-time-pending-row'
                        : undefined
                    }
                  >
                    <th scope="row">{entry.staffName}</th>
                    <td>
                      {entry.jobNumber != null ? (
                        <Link href={'/hq/jobs/' + entry.jobId}>
                          {formatJobNumber(entry.jobNumber)}
                          {entry.jobTitle ? ` · ${entry.jobTitle}` : ''}
                        </Link>
                      ) : (
                        entry.jobId
                      )}
                    </td>
                    <td>{formatPerthDate(entry.startedAt)}</td>
                    <td>{formatPerthTime(entry.startedAt)}</td>
                    <td>{entry.endedAt ? formatPerthTime(entry.endedAt) : 'Open'}</td>
                    <td>{formatDurationMinutes(entry.breakMinutes)}</td>
                    <td>{formatDurationMinutes(entry.workedMinutes ?? 0)}</td>
                    <td>
                      {entry.billableMinutes != null
                        ? formatDurationMinutes(entry.billableMinutes)
                        : 'Not set'}
                    </td>
                    <td>
                      <span className="ee-timesheet-status">{jobTimeStatusLabel(entry.status)}</span>
                    </td>
                    <td>
                      <div className="ee-timesheet-row-actions">
                        {canApprove ? (
                          <button
                            type="button"
                            className="ee-timesheet-approve"
                            disabled={busy}
                            onClick={() => runReview(entry, 'approve')}
                          >
                            {busy && busyId === entry.id ? '…' : 'Approve'}
                          </button>
                        ) : null}
                        {canReject ? (
                          <button
                            type="button"
                            className="ee-text-action"
                            disabled={busy}
                            onClick={() => {
                              setRowError(null);
                              setRejectReason('');
                              setRejectTarget(entry);
                            }}
                          >
                            Reject
                          </button>
                        ) : null}
                        {canCorrect ? (
                          <button
                            type="button"
                            className="ee-text-action"
                            disabled={busy}
                            onClick={() => setCorrectTarget(entry)}
                          >
                            Correct
                          </button>
                        ) : null}
                      </div>
                      {rowError?.id === entry.id ? (
                        <p className="ee-form-error ee-time-row-feedback" role="alert">
                          {rowError.message}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <dialog
        ref={rejectDialog}
        className="ee-timesheet-dialog"
        aria-label="Reject time entry"
        onClose={closeReject}
        onClick={(event) => {
          if (event.target === rejectDialog.current) closeReject();
        }}
      >
        {rejectTarget ? (
          <div className="ee-timesheet-dialog-body">
            <div className="ee-timesheet-dialog-head">
              <div>
                <strong>Reject time entry</strong>
                <p>
                  {rejectTarget.staffName} · {formatPerthDate(rejectTarget.startedAt)} ·{' '}
                  {formatDurationMinutes(rejectTarget.workedMinutes ?? 0)} worked
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={closeReject}>
                ×
              </button>
            </div>
            <label>
              Rejection reason
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={3}
                required
                placeholder="Required"
              />
            </label>
            {rowError?.id === rejectTarget.id ? (
              <p className="ee-form-error" role="alert">
                {rowError.message}
              </p>
            ) : null}
            <div className="ee-timesheet-dialog-actions">
              <button type="button" onClick={closeReject} disabled={pending}>
                Cancel
              </button>
              <button
                type="button"
                className="hq-detail-action-primary"
                disabled={pending}
                onClick={submitReject}
              >
                {pending && busyId === rejectTarget.id ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>

      <dialog
        ref={correctDialog}
        className="ee-timesheet-dialog ee-timesheet-correct-dialog"
        aria-label="Correct time entry"
        onClose={closeCorrect}
        onClick={(event) => {
          if (event.target === correctDialog.current) closeCorrect();
        }}
      >
        {correctTarget ? (
          <div className="ee-timesheet-dialog-body">
            <div className="ee-timesheet-dialog-head">
              <div>
                <strong>Correct time entry</strong>
                <p>
                  {correctTarget.staffName} · {formatPerthDate(correctTarget.startedAt)}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={closeCorrect}>
                ×
              </button>
            </div>
            <TimeEntryReviewForm
              entry={{
                id: correctTarget.id,
                startedAt: correctTarget.startedAt,
                endedAt: correctTarget.endedAt,
                breakMinutes: correctTarget.breakMinutes,
                workedMinutes: correctTarget.workedMinutes,
                billableMinutes: correctTarget.billableMinutes,
                status: correctTarget.status,
              }}
              actionsClassName="ee-timesheet-actions"
              onCancel={closeCorrect}
              onSaved={() => {
                closeCorrect();
              }}
            />
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

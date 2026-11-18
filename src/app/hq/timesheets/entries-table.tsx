'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { reviewTimeEntryAction } from '@/app/field/actions';
import TimeEntryReviewForm from '@/app/hq/time-entry-review-form';
import { formatJobNumber, formatPerthDate, formatPerthTime } from '@/lib/perth-day';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import { inferBillableMode, type ReviewTimeDecision } from '@/lib/review-time-entry';
import {
  canQuickApproveTimeEntry,
  canReviewJobTimeEntry,
  jobTimeStatusLabel,
  timeEntryReviewNotes,
  timeEntryStatusTone,
} from '@/lib/job-time-list';
import type { TimesheetEntryStatusFilter } from '@/lib/timesheet-week';
import TimesheetEntriesFilters from './entries-filters';

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
  rejectionReason: string | null;
  correctionNote: string | null;
  originalWorkedMinutes: number | null;
};

export default function TimesheetEntriesTable({
  entries,
  mondayKey,
  staffFilter,
  jobFilter,
  statusFilter,
  dayFilter,
  staffOptions,
  jobOptions,
  dayLabel,
  staffLabel,
}: {
  entries: TimesheetEntryRow[];
  mondayKey: string;
  staffFilter: string;
  jobFilter: string;
  statusFilter: TimesheetEntryStatusFilter;
  dayFilter: string;
  staffOptions: { id: string; fullName: string }[];
  jobOptions: { id: string; number: number; title: string }[];
  dayLabel?: string;
  staffLabel?: string;
}) {
  const router = useRouter();
  const correctDialog = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [editTarget, setEditTarget] = useState<TimesheetEntryRow | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(timer);
  }, [flash]);

  useEffect(() => {
    const node = correctDialog.current;
    if (!node) return;
    if (editTarget && !node.open) node.showModal();
    if (!editTarget && node.open) node.close();
  }, [editTarget]);

  const closeEdit = useCallback(() => {
    setEditTarget(null);
  }, []);

  const runReview = useCallback(
    (entry: TimesheetEntryRow, decision: ReviewTimeDecision) => {
      if (pending && busyId) return;
      if (decision !== 'approve') return;
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
      data.set('rejection_reason', '');
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
        setFlash(result.message || 'Time entry approved.');
        setBusyId(null);
        router.refresh();
      });
    },
    [pending, busyId, router],
  );

  return (
    <section className="hq-panel ee-compact-panel" id="timesheet-entries">
      <div className="ee-section-title ee-timesheet-entries-head">
        <div>
          <span className="ee-eyebrow">ENTRIES</span>
          <h2>
            {entries.length} individual {entries.length === 1 ? 'result' : 'results'}
          </h2>
        </div>
      </div>

      <TimesheetEntriesFilters
        mondayKey={mondayKey}
        staffFilter={staffFilter}
        jobFilter={jobFilter}
        statusFilter={statusFilter}
        dayFilter={dayFilter}
        staffOptions={staffOptions}
        jobOptions={jobOptions}
        dayLabel={dayLabel}
        staffLabel={staffLabel}
      />

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
                const showApprove = canQuickApproveTimeEntry(entry.status);
                const canEdit = canReviewJobTimeEntry(entry.status);
                const busy = busyId === entry.id && pending;
                const reviewNotes = timeEntryReviewNotes(entry);
                const tone = timeEntryStatusTone(entry.status);
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
                      <span className={'ee-timesheet-status ee-timesheet-status-' + tone}>
                        {jobTimeStatusLabel(entry.status, {
                          correctionNote: entry.correctionNote,
                        })}
                      </span>
                      {reviewNotes.length ? (
                        <div className="ee-timesheet-review-notes">
                          {reviewNotes.map((note) => (
                            <p
                              key={note.kind + note.text}
                              className={
                                'ee-timesheet-review-note ee-timesheet-review-note-' + note.kind
                              }
                            >
                              <strong>{note.label}:</strong> {note.text}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="ee-timesheet-row-actions">
                        {showApprove ? (
                          <button
                            type="button"
                            className="ee-timesheet-approve"
                            disabled={busy}
                            onClick={() => runReview(entry, 'approve')}
                          >
                            {busy && busyId === entry.id ? '…' : 'Approve'}
                          </button>
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            className="ee-text-action ee-timesheet-edit"
                            disabled={busy}
                            onClick={() => setEditTarget(entry)}
                          >
                            Edit
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
        ref={correctDialog}
        className="ee-timesheet-dialog ee-timesheet-correct-dialog"
        aria-label="Edit time entry"
        onClose={closeEdit}
        onClick={(event) => {
          if (event.target === correctDialog.current) closeEdit();
        }}
      >
        {editTarget ? (
          <div className="ee-timesheet-dialog-body">
            <div className="ee-timesheet-dialog-head">
              <div>
                <strong>Edit time entry</strong>
                <p>
                  {editTarget.staffName} · {formatPerthDate(editTarget.startedAt)}
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={closeEdit}>
                ×
              </button>
            </div>
            <TimeEntryReviewForm
              entry={{
                id: editTarget.id,
                startedAt: editTarget.startedAt,
                endedAt: editTarget.endedAt,
                breakMinutes: editTarget.breakMinutes,
                workedMinutes: editTarget.workedMinutes,
                billableMinutes: editTarget.billableMinutes,
                status: editTarget.status,
              }}
              actionsClassName="ee-timesheet-actions"
              onCancel={closeEdit}
              onSaved={() => {
                closeEdit();
              }}
            />
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import { jobLabourTotals, type JobDetailTimeEntry } from '@/lib/job-detail-summary';
import {
  canReviewJobTimeEntry,
  filterJobTimeEntries,
  isLiveJobTimeStatus,
  isPendingJobTimeStatus,
  jobTimeListSummary,
  jobTimeStatusLabel,
  type JobTimeListFilter,
} from '@/lib/job-time-list';
import TimeEntryReviewForm from '@/app/hq/time-entry-review-form';

const DESKTOP_MQ = '(min-width: 900px)';

function useDesktopTimeLayout(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_MQ);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(DESKTOP_MQ).matches,
    () => true,
  );
}

function perthDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function perthClock(iso: string | null): string {
  if (!iso) return 'Open';
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function confirmDiscardUnsaved(): boolean {
  if (typeof window === 'undefined') return true;
  return window.confirm('You have unsaved time changes. Discard them and continue?');
}

function WorkedCell({ entry }: { entry: JobDetailTimeEntry }) {
  if (isLiveJobTimeStatus(entry.status)) return <>Live</>;
  return <>{formatDurationMinutes(entry.workedMinutes ?? 0)}</>;
}

function BillableCell({ entry }: { entry: JobDetailTimeEntry }) {
  if (entry.billableMinutes != null) return <>{formatDurationMinutes(entry.billableMinutes)}</>;
  if (isLiveJobTimeStatus(entry.status)) return <>—</>;
  return <>Not set</>;
}

export default function JobTimePanel({
  jobId,
  timeEntries,
}: {
  jobId: string;
  timeEntries: JobDetailTimeEntry[];
}) {
  const desktop = useDesktopTimeLayout();
  const [filter, setFilter] = useState<JobTimeListFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);

  const labour = jobLabourTotals(jobId, timeEntries);
  const summary = jobTimeListSummary(timeEntries);
  const rows = useMemo(() => filterJobTimeEntries(timeEntries, filter), [timeEntries, filter]);

  useEffect(() => {
    if (!editorDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editorDirty]);

  const requestCloseEditor = useCallback(() => {
    if (editorDirty && !confirmDiscardUnsaved()) return false;
    setExpandedId(null);
    setEditorDirty(false);
    return true;
  }, [editorDirty]);

  const requestExpand = useCallback(
    (entryId: string) => {
      if (expandedId === entryId) {
        requestCloseEditor();
        return;
      }
      if (expandedId && editorDirty && !confirmDiscardUnsaved()) return;
      setExpandedId(entryId);
      setEditorDirty(false);
    },
    [expandedId, editorDirty, requestCloseEditor],
  );

  const requestFilter = useCallback(
    (next: JobTimeListFilter) => {
      if (next === filter) return;
      if (expandedId && editorDirty && !confirmDiscardUnsaved()) return;
      setFilter(next);
      setExpandedId(null);
      setEditorDirty(false);
    },
    [filter, expandedId, editorDirty],
  );

  const onSaved = useCallback(() => {
    setEditorDirty(false);
  }, []);

  const onCancel = useCallback(() => {
    setExpandedId(null);
    setEditorDirty(false);
  }, []);

  const onDirtyChange = useCallback((dirty: boolean) => {
    setEditorDirty(dirty);
  }, []);

  const emptyMessage =
    filter === 'pending'
      ? 'No time entries are waiting for approval.'
      : filter === 'approved'
        ? 'No approved time entries yet.'
        : 'No technician time recorded yet.';

  const renderEditor = (entry: JobDetailTimeEntry) => (
    <div className="ee-time-inline-editor" id={`time-editor-${entry.id}`}>
      <TimeEntryReviewForm
        key={entry.id}
        entry={{
          id: entry.id,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
          breakMinutes: entry.breakMinutes,
          workedMinutes: entry.workedMinutes,
          billableMinutes: entry.billableMinutes,
          status: entry.status,
        }}
        onDirtyChange={onDirtyChange}
        onCancel={onCancel}
        onSaved={onSaved}
      />
    </div>
  );

  const renderActions = (entry: JobDetailTimeEntry) => {
    if (!canReviewJobTimeEntry(entry.status)) {
      return <span className="ee-muted">—</span>;
    }
    const open = expandedId === entry.id;
    return (
      <button
        type="button"
        className="ee-text-action"
        aria-expanded={open}
        aria-controls={`time-editor-${entry.id}`}
        onClick={() => requestExpand(entry.id)}
      >
        {open ? 'Close' : 'Edit'}
      </button>
    );
  };

  return (
    <section className="hq-panel ee-compact-panel" id="time-labour">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">TIME</span>
          <h2>Time and labour</h2>
        </div>
        <Link href="/hq/timesheets" className="ee-text-action">
          Timesheets →
        </Link>
      </div>

      <div className="ee-job-stat-grid">
        <div>
          <span className="ee-eyebrow">WORKED</span>
          <strong>{labour ? formatDurationMinutes(labour.totalWorkedMinutes) : 'None yet'}</strong>
          <span className="ee-muted">
            {labour
              ? `${labour.technicianCount} tech${labour.technicianCount === 1 ? '' : 's'} · ${labour.entryCount} finished`
              : 'Finished entries only'}
            {summary.liveCount
              ? ` · ${summary.liveCount} live timer${summary.liveCount === 1 ? '' : 's'} excluded`
              : ''}
          </span>
        </div>
        <div>
          <span className="ee-eyebrow">BILLABLE</span>
          <strong>
            {labour ? formatDurationMinutes(labour.totalBillableMinutes) : 'None yet'}
          </strong>
          <span className="ee-muted">
            {labour
              ? `Breaks ${formatDurationMinutes(labour.totalBreakMinutes)}${labour.billableUnsetCount ? ` · ${labour.billableUnsetCount} unset` : ''}`
              : 'Set when time is approved or corrected'}
          </span>
        </div>
        <div>
          <span className="ee-eyebrow">PENDING</span>
          <strong>{summary.pendingCount ? `${summary.pendingCount} waiting` : 'None'}</strong>
          <span className="ee-muted">
            {summary.pendingCount ? 'Submitted, rejected or corrected' : 'Nothing waiting for review'}
          </span>
        </div>
      </div>

      <div className="ee-time-filters" role="group" aria-label="Time entry filter">
        <button
          type="button"
          className={filter === 'all' ? 'active' : undefined}
          aria-pressed={filter === 'all'}
          onClick={() => requestFilter('all')}
        >
          All · {summary.totalCount}
        </button>
        <button
          type="button"
          className={filter === 'pending' ? 'active' : undefined}
          aria-pressed={filter === 'pending'}
          onClick={() => requestFilter('pending')}
        >
          Pending{summary.pendingCount ? ` · ${summary.pendingCount}` : ''}
        </button>
        <button
          type="button"
          className={filter === 'approved' ? 'active' : undefined}
          aria-pressed={filter === 'approved'}
          onClick={() => requestFilter('approved')}
        >
          Approved{summary.approvedCount ? ` · ${summary.approvedCount}` : ''}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          {emptyMessage}
        </p>
      ) : (
        <>
          <div className="ee-job-table-wrap ee-time-table-wrap">
            <table className="ee-job-table ee-time-table">
              <thead>
                <tr>
                  <th scope="col">Technician</th>
                  <th scope="col">Date</th>
                  <th scope="col">Start</th>
                  <th scope="col">End</th>
                  <th scope="col">Worked</th>
                  <th scope="col">Break</th>
                  <th scope="col">Billable</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => {
                  const open = desktop && expandedId === entry.id;
                  return (
                    <Fragment key={entry.id}>
                      <tr
                        className={
                          (isPendingJobTimeStatus(entry.status) ? 'ee-time-pending-row' : '') +
                          (open ? ' ee-time-row-open' : '')
                        }
                      >
                        <th scope="row">{entry.staffName}</th>
                        <td>{perthDate(entry.startedAt)}</td>
                        <td>{perthClock(entry.startedAt)}</td>
                        <td>{perthClock(entry.endedAt)}</td>
                        <td>
                          <WorkedCell entry={entry} />
                        </td>
                        <td>{formatDurationMinutes(entry.breakMinutes)}</td>
                        <td>
                          <BillableCell entry={entry} />
                        </td>
                        <td>
                          <span
                            className={
                              'ee-time-status ee-time-status-' +
                              entry.status.replaceAll('_', '-')
                            }
                          >
                            {jobTimeStatusLabel(entry.status)}
                          </span>
                        </td>
                        <td>{renderActions(entry)}</td>
                      </tr>
                      {open ? (
                        <tr className="ee-time-editor-row">
                          <td colSpan={9}>{renderEditor(entry)}</td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="ee-time-entry-list">
            {rows.map((entry) => {
              const open = !desktop && expandedId === entry.id;
              return (
                <article
                  className={
                    'ee-time-entry-card' +
                    (isPendingJobTimeStatus(entry.status) ? ' ee-time-entry-pending' : '') +
                    (open ? ' ee-time-entry-open' : '')
                  }
                  key={entry.id}
                >
                  <div className="ee-time-entry-main">
                    <div className="ee-time-entry-head">
                      <strong title={entry.staffName}>{entry.staffName}</strong>
                      <span
                        className={
                          'ee-time-status ee-time-status-' + entry.status.replaceAll('_', '-')
                        }
                      >
                        {jobTimeStatusLabel(entry.status)}
                      </span>
                    </div>
                    <span className="ee-muted">
                      {perthDate(entry.startedAt)} · {perthClock(entry.startedAt)} →{' '}
                      {perthClock(entry.endedAt)}
                    </span>
                    <span className="ee-muted">
                      {isLiveJobTimeStatus(entry.status)
                        ? 'Live timer'
                        : `${formatDurationMinutes(entry.workedMinutes ?? 0)} worked`}
                      {' · Break '}
                      {formatDurationMinutes(entry.breakMinutes)}
                      {entry.billableMinutes != null
                        ? ` · Billable ${formatDurationMinutes(entry.billableMinutes)}`
                        : isLiveJobTimeStatus(entry.status)
                          ? ''
                          : ' · Billable not set'}
                    </span>
                    {entry.note ? <p>{entry.note}</p> : null}
                  </div>
                  <div className="ee-time-entry-actions">{renderActions(entry)}</div>
                  {open ? renderEditor(entry) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import { jobLabourTotals, type JobDetailTimeEntry } from '@/lib/job-detail-summary';
import {
  canReviewJobTimeEntry,
  filterJobTimeEntries,
  isLiveJobTimeStatus,
  isPendingJobTimeStatus,
  jobTimeListSummary,
  type JobTimeListFilter,
} from '@/lib/job-time-list';
import TimeEntryReviewForm from '@/app/hq/time-entry-review-form';

function perthWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
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

function TimeEntryReview({ entry }: { entry: JobDetailTimeEntry }) {
  if (!canReviewJobTimeEntry(entry.status)) return null;
  return (
    <details className="ee-expand ee-nested-expand ee-time-review">
      <summary>
        <span>
          <strong>Review</strong>
          <span className="ee-muted"> Approve, reject, correct or set billable minutes</span>
        </span>
        <span className="ee-expand-mark" aria-hidden="true">
          ＋
        </span>
      </summary>
      <TimeEntryReviewForm entry={entry} />
    </details>
  );
}

export default function JobTimePanel({
  jobId,
  timeEntries,
}: {
  jobId: string;
  timeEntries: JobDetailTimeEntry[];
}) {
  const [filter, setFilter] = useState<JobTimeListFilter>('pending');
  const labour = jobLabourTotals(jobId, timeEntries);
  const summary = jobTimeListSummary(timeEntries);
  const preferred = summary.pendingCount > 0 ? 'pending' : 'all';
  const activeFilter = filter === 'pending' && summary.pendingCount === 0 ? preferred : filter;
  const rows = useMemo(
    () => filterJobTimeEntries(timeEntries, activeFilter),
    [timeEntries, activeFilter],
  );

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
          className={activeFilter === 'pending' ? 'active' : undefined}
          aria-pressed={activeFilter === 'pending'}
          onClick={() => setFilter('pending')}
        >
          Pending{summary.pendingCount ? ` · ${summary.pendingCount}` : ''}
        </button>
        <button
          type="button"
          className={activeFilter === 'all' ? 'active' : undefined}
          aria-pressed={activeFilter === 'all'}
          onClick={() => setFilter('all')}
        >
          All entries · {summary.totalCount}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          {activeFilter === 'pending'
            ? 'No time entries are waiting for approval.'
            : 'No technician time recorded yet.'}
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
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr
                    key={entry.id}
                    className={isPendingJobTimeStatus(entry.status) ? 'ee-time-pending-row' : undefined}
                  >
                    <th scope="row">{entry.staffName}</th>
                    <td>{perthDate(entry.startedAt)}</td>
                    <td>{perthClock(entry.startedAt)}</td>
                    <td>{perthClock(entry.endedAt)}</td>
                    <td>
                      {isLiveJobTimeStatus(entry.status)
                        ? 'Live'
                        : formatDurationMinutes(entry.workedMinutes ?? 0)}
                    </td>
                    <td>{formatDurationMinutes(entry.breakMinutes)}</td>
                    <td>
                      {entry.billableMinutes != null
                        ? formatDurationMinutes(entry.billableMinutes)
                        : isLiveJobTimeStatus(entry.status)
                          ? '—'
                          : 'Not set'}
                    </td>
                    <td>{entry.status.replaceAll('_', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ee-time-entry-list">
            {rows.map((entry) => (
              <article
                className={
                  'ee-time-entry-card' +
                  (isPendingJobTimeStatus(entry.status) ? ' ee-time-entry-pending' : '')
                }
                key={entry.id}
              >
                <div className="ee-time-entry-main">
                  <strong>
                    {entry.staffName}
                    {isPendingJobTimeStatus(entry.status) ? ' · Needs review' : ''}
                  </strong>
                  <span className="ee-muted">
                    {perthWhen(entry.startedAt)}
                    {' → '}
                    {entry.endedAt ? perthClock(entry.endedAt) : 'open'}
                  </span>
                  <span className="ee-muted">
                    {isLiveJobTimeStatus(entry.status)
                      ? `Live · ${entry.status.replaceAll('_', ' ')}`
                      : `${formatDurationMinutes(entry.workedMinutes ?? 0)} worked`}
                    {' · Break '}
                    {formatDurationMinutes(entry.breakMinutes)}
                    {entry.billableMinutes != null
                      ? ` · Billable ${formatDurationMinutes(entry.billableMinutes)}`
                      : isLiveJobTimeStatus(entry.status)
                        ? ''
                        : ' · Billable not set'}
                    {' · '}
                    {entry.status.replaceAll('_', ' ')}
                  </span>
                  {entry.note ? <p>{entry.note}</p> : null}
                </div>
                <TimeEntryReview entry={entry} />
              </article>
            ))}
          </div>

          <div className="ee-time-desktop-reviews">
            {rows
              .filter((entry) => canReviewJobTimeEntry(entry.status))
              .map((entry) => (
                <div
                  className={
                    'ee-time-entry-card' +
                    (isPendingJobTimeStatus(entry.status) ? ' ee-time-entry-pending' : '')
                  }
                  key={`review-${entry.id}`}
                >
                  <div className="ee-time-entry-main">
                    <strong>
                      {entry.staffName} · {perthDate(entry.startedAt)} ·{' '}
                      {entry.status.replaceAll('_', ' ')}
                    </strong>
                  </div>
                  <TimeEntryReview entry={entry} />
                </div>
              ))}
          </div>
        </>
      )}
    </section>
  );
}

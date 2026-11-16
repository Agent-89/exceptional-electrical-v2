import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import {
  VISIT_OUTCOME_LABELS,
  isTerminalVisitOutcome,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';
import {
  buildJobAttentionItems,
  groupTimeEntriesByTechnicianDate,
  isLiveTimeStatus,
  isPendingApprovalStatus,
  jobLabourTotals,
  summarizeTechReport,
  visitReportStatusCounts,
  type JobDetailAppointment,
  type JobDetailTechReport,
  type JobDetailTimeEntry,
} from '@/lib/job-detail-summary';
import { addOfficeNoteAction, reviewTimeEntryAction } from '@/app/hq/tech/actions';
import OfficeVisitOutcomeForm from './office-visit-outcome-form';

type NoteView = {
  id: string;
  body: string;
  authorName: string | null;
  visibility: string;
  createdAt: string;
};

type FileView = {
  id: string;
  signedUrl: string | null;
  caption: string | null;
  uploadedByName: string | null;
  contentType: string;
};

export type JobFieldSection = 'attention' | 'visits' | 'time' | 'costs' | 'files';

const REVIEWABLE_TIME = new Set(['submitted', 'rejected', 'corrected', 'approved']);

function perthWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function perthDayTime(startsAt: string, endsAt: string): string {
  const day = new Date(startsAt).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const start = new Date(startsAt).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  const end = new Date(endsAt).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} · ${start} – ${end}`;
}

function perthInputValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Australia/Perth', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

function isDocument(contentType: string): boolean {
  const value = contentType.trim().toLowerCase();
  return value.length > 0 && !value.startsWith('image/');
}

function canReviewEntry(status: string): boolean {
  return REVIEWABLE_TIME.has(status);
}

function TimeEntryReview({ entry }: { entry: JobDetailTimeEntry }) {
  if (!canReviewEntry(entry.status)) return null;
  return (
    <details className="ee-expand ee-nested-expand">
      <summary>
        <span>
          <strong>Review {entry.staffName}</strong>
          <span className="ee-muted">
            {' '}
            {perthWhen(entry.startedAt)} · {entry.status} · approve, reject, correct or set
            billable minutes
          </span>
        </span>
        <span className="ee-expand-mark" aria-hidden="true">
          ＋
        </span>
      </summary>
      <form action={reviewTimeEntryAction} className="ee-edit-form">
        <input type="hidden" name="entry_id" value={entry.id} />
        <label>
          Billable minutes
          <input
            name="billable_minutes"
            type="number"
            min={0}
            defaultValue={entry.billableMinutes ?? entry.workedMinutes ?? 0}
          />
        </label>
        <label>
          Rejection reason
          <textarea name="rejection_reason" rows={2} maxLength={2000} />
        </label>
        <label>
          Corrected start (Perth)
          <input
            type="datetime-local"
            name="started_at"
            defaultValue={perthInputValue(entry.startedAt)}
          />
        </label>
        <label>
          Corrected end (Perth)
          <input
            type="datetime-local"
            name="ended_at"
            defaultValue={perthInputValue(entry.endedAt)}
          />
        </label>
        <label>
          Break minutes
          <input type="number" name="break_minutes" min={0} defaultValue={entry.breakMinutes} />
        </label>
        <label>
          Correction note
          <textarea
            name="correction_note"
            rows={2}
            maxLength={2000}
            placeholder="Required when saving a correction"
          />
        </label>
        <div className="ee-review-actions">
          <button name="decision" value="approve" type="submit">
            Approve
          </button>
          <button name="decision" value="reject" type="submit">
            Reject
          </button>
          <button name="decision" value="correct" type="submit">
            Save correction
          </button>
        </div>
      </form>
    </details>
  );
}

function EntryFacts({ entry }: { entry: JobDetailTimeEntry }) {
  return (
    <div className="ee-visit">
      <strong>
        {entry.staffName} ·{' '}
        {isLiveTimeStatus(entry.status)
          ? `Live · ${entry.status.replaceAll('_', ' ')}`
          : `${formatDurationMinutes(entry.workedMinutes ?? 0)} worked · ${entry.status}`}
      </strong>
      <span>
        {perthWhen(entry.startedAt)}
        {entry.endedAt
          ? ` – ${new Date(entry.endedAt).toLocaleTimeString('en-AU', {
              timeZone: 'Australia/Perth',
              hour: 'numeric',
              minute: '2-digit',
            })}`
          : ' – open'}
        {' · Break '}
        {formatDurationMinutes(entry.breakMinutes)}
        {entry.billableMinutes != null
          ? ` · Billable ${formatDurationMinutes(entry.billableMinutes)}`
          : isLiveTimeStatus(entry.status)
            ? ''
            : ' · Billable not set'}
      </span>
      {entry.note ? <p>{entry.note}</p> : null}
    </div>
  );
}

export default function JobFieldActivity({
  jobId,
  appointments,
  techReports,
  timeEntries,
  notes,
  photos,
  section,
  scheduleForm = null,
}: {
  jobId: string;
  appointments: JobDetailAppointment[];
  techReports: JobDetailTechReport[];
  timeEntries: JobDetailTimeEntry[];
  notes: NoteView[];
  photos: FileView[];
  section: JobFieldSection;
  scheduleForm?: ReactNode;
}) {
  const labour = jobLabourTotals(jobId, timeEntries);
  const pendingApprovals = timeEntries.filter((entry) => isPendingApprovalStatus(entry.status));
  const liveEntries = timeEntries.filter((entry) => isLiveTimeStatus(entry.status));
  const timeGroups = groupTimeEntriesByTechnicianDate(timeEntries);
  const attention = buildJobAttentionItems({ appointments, techReports, timeEntries });
  const visitStats = visitReportStatusCounts({ appointments, techReports });
  const documents = photos.filter((file) => isDocument(file.contentType));
  const images = photos.filter((file) => !isDocument(file.contentType));

  if (section === 'attention') {
    return (
      <section className="hq-panel ee-compact-panel ee-attention" id="requires-attention">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">REQUIRES ATTENTION</span>
            <h2>Outstanding actions</h2>
          </div>
          <span className="ee-muted">{attention.length}</span>
        </div>
        {attention.length ? (
          <ul className="ee-attention-list">
            {attention.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span className="ee-muted">{item.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ee-muted" style={{ marginBottom: 0 }}>
            Nothing outstanding on visits, reports or time approvals.
          </p>
        )}
      </section>
    );
  }

  if (section === 'visits') {
    return (
      <section className="hq-panel ee-compact-panel" id="visits-reports">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">VISITS</span>
            <h2>Appointments and technician reports</h2>
          </div>
          <span className="ee-muted">{appointments.length}</span>
        </div>
        <p className="ee-muted" style={{ marginTop: 0 }}>
          {visitStats.visitCount} visit{visitStats.visitCount === 1 ? '' : 's'} ·{' '}
          {visitStats.reportCount} report{visitStats.reportCount === 1 ? '' : 's'} ·{' '}
          {visitStats.finalisedCount} finalised
          {visitStats.pendingOutcomeCount
            ? ` · ${visitStats.pendingOutcomeCount} open outcome${visitStats.pendingOutcomeCount === 1 ? '' : 's'}`
            : ''}
        </p>
        {appointments.length ? (
          appointments.map((appointment) => {
            const reportsForVisit = techReports.filter(
              (report) => report.appointmentId === appointment.id,
            );
            const crew =
              appointment.electricianNames && appointment.electricianNames.length
                ? appointment.electricianNames.join(', ')
                : 'Visit crew not listed';
            return (
              <details className="ee-expand ee-job-row" key={appointment.id}>
                <summary>
                  <span className="ee-job-row-main">
                    <strong>{perthDayTime(appointment.startsAt, appointment.endsAt)}</strong>
                    <span className="ee-muted">
                      {FIELD_STATUS_LABELS[appointment.fieldStatus as FieldStatus] ??
                        appointment.fieldStatus}
                      {appointment.followUp ? ' · Further visit' : ''}
                      {reportsForVisit.length
                        ? ` · ${reportsForVisit.length} report${reportsForVisit.length === 1 ? '' : 's'}`
                        : ' · No reports'}
                    </span>
                  </span>
                  <span className="ee-expand-mark" aria-hidden="true">
                    ＋
                  </span>
                </summary>
                <div className="ee-job-row-body">
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Schedule {appointment.status} · Visit electricians: {crew}
                  </p>
                  {appointment.scheduleNotes ? <p>Instructions: {appointment.scheduleNotes}</p> : null}

                  <div className="ee-job-subblock">
                    <strong>Shared office summary</strong>
                    {appointment.completionNote ? <p>{appointment.completionNote}</p> : null}
                    {appointment.outstanding ? <p>Outstanding: {appointment.outstanding}</p> : null}
                    {appointment.issues ? <p>Issues: {appointment.issues}</p> : null}
                    {!appointment.completionNote &&
                    !appointment.outstanding &&
                    !appointment.issues ? (
                      <p className="ee-muted">No shared summary yet.</p>
                    ) : null}
                    <p className="ee-muted" style={{ marginBottom: 0 }}>
                      Further visit required: {appointment.followUp ? 'Yes' : 'No'}
                      {isTerminalVisitOutcome(appointment.fieldStatus) ? ' · Finalised' : ''}
                    </p>
                  </div>

                  <div className="ee-job-subblock">
                    <strong>Technician reports</strong>
                    {reportsForVisit.length ? (
                      <ul className="ee-report-summaries">
                        {reportsForVisit.map((report) => (
                          <li key={report.id}>
                            <details className="ee-expand ee-nested-expand">
                              <summary>
                                <span>
                                  <strong>{report.technicianName ?? 'Technician'}</strong>
                                  <span className="ee-muted">
                                    {' '}
                                    · {summarizeTechReport(report)}
                                  </span>
                                </span>
                                <span className="ee-expand-mark" aria-hidden="true">
                                  ＋
                                </span>
                              </summary>
                              <div className="ee-job-row-body">
                                <p className="ee-muted" style={{ marginTop: 0 }}>
                                  {VISIT_OUTCOME_LABELS[report.progressStatus as VisitOutcomeStatus] ??
                                    report.progressStatus}{' '}
                                  · Updated {perthWhen(report.updatedAt)}
                                </p>
                                {report.workSummary ? <p>{report.workSummary}</p> : null}
                                {report.outstandingWork ? (
                                  <p>Outstanding: {report.outstandingWork}</p>
                                ) : null}
                                {report.issues ? <p>Issues: {report.issues}</p> : null}
                                <p className="ee-muted" style={{ marginBottom: 0 }}>
                                  Further visit: {report.followUpRequired ? 'Yes' : 'No'}
                                </p>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ee-muted">No individual technician work reports yet.</p>
                    )}
                  </div>

                  {!isTerminalVisitOutcome(appointment.fieldStatus) ? (
                    <OfficeVisitOutcomeForm
                      appointmentId={appointment.id}
                      fieldStatus={appointment.fieldStatus}
                      completionNote={appointment.completionNote}
                      outstanding={appointment.outstanding}
                      issues={appointment.issues}
                      followUp={appointment.followUp}
                    />
                  ) : null}
                </div>
              </details>
            );
          })
        ) : (
          <p className="ee-muted">No visits scheduled yet.</p>
        )}
        {scheduleForm ? (
          <details className="ee-expand">
            <summary>
              + Schedule a visit
              <span className="ee-expand-mark" aria-hidden="true">
                ＋
              </span>
            </summary>
            {scheduleForm}
          </details>
        ) : null}
      </section>
    );
  }

  if (section === 'time') {
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
            <span className="ee-eyebrow">LABOUR RECORDED</span>
            <strong>
              {labour ? formatDurationMinutes(labour.totalWorkedMinutes) : 'None yet'}
            </strong>
            <span className="ee-muted">
              {labour
                ? `${labour.technicianCount} tech${labour.technicianCount === 1 ? '' : 's'} · ${labour.entryCount} finished ${labour.entryCount === 1 ? 'entry' : 'entries'}`
                : 'Finished entries only'}
              {liveEntries.length
                ? ` · ${liveEntries.length} live timer${liveEntries.length === 1 ? '' : 's'} excluded`
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
            <span className="ee-eyebrow">PENDING APPROVALS</span>
            <strong>
              {pendingApprovals.length ? `${pendingApprovals.length} waiting` : 'None'}
            </strong>
            <span className="ee-muted">
              {pendingApprovals.length
                ? `${formatDurationMinutes(
                    pendingApprovals.reduce(
                      (acc, entry) => acc + Math.max(0, entry.workedMinutes ?? 0),
                      0,
                    ),
                  )} worked`
                : 'Submitted, rejected or corrected entries'}
            </span>
          </div>
        </div>

        {pendingApprovals.length ? (
          <div className="ee-pending-block" id="pending-approvals">
            <div className="ee-section-title" style={{ marginBottom: 8 }}>
              <div>
                <span className="ee-eyebrow">PENDING APPROVALS</span>
                <strong style={{ display: 'block', marginTop: 4 }}>
                  {pendingApprovals.length} awaiting review
                </strong>
              </div>
            </div>
            <div className="ee-job-table-wrap">
              <table className="ee-job-table">
                <thead>
                  <tr>
                    <th scope="col">Technician</th>
                    <th scope="col">Started</th>
                    <th scope="col">Worked</th>
                    <th scope="col">Billable</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((entry) => (
                    <tr key={entry.id}>
                      <th scope="row">{entry.staffName}</th>
                      <td>{perthWhen(entry.startedAt)}</td>
                      <td>{formatDurationMinutes(entry.workedMinutes ?? 0)}</td>
                      <td>
                        {entry.billableMinutes != null
                          ? formatDurationMinutes(entry.billableMinutes)
                          : 'Not set'}
                      </td>
                      <td>{entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pendingApprovals.map((entry) => (
              <TimeEntryReview entry={entry} key={entry.id} />
            ))}
          </div>
        ) : (
          <p className="ee-muted">No time entries are waiting for approval.</p>
        )}

        {timeGroups.length ? (
          <div className="ee-time-groups">
            {timeGroups.map((group) => (
              <details className="ee-expand ee-job-row" key={group.key} open={group.pendingCount > 0}>
                <summary>
                  <span className="ee-job-row-main">
                    <strong>
                      {group.staffName} · {group.dateLabel}
                    </strong>
                    <span className="ee-muted">
                      {formatDurationMinutes(group.workedMinutes)} worked · {group.entries.length}{' '}
                      {group.entries.length === 1 ? 'entry' : 'entries'}
                      {group.pendingCount ? ` · ${group.pendingCount} pending` : ''}
                    </span>
                  </span>
                  <span className="ee-expand-mark" aria-hidden="true">
                    ＋
                  </span>
                </summary>
                <div className="ee-job-row-body">
                  {group.entries.map((entry) => (
                    <div key={entry.id}>
                      <EntryFacts entry={entry} />
                      {isPendingApprovalStatus(entry.status) ? null : <TimeEntryReview entry={entry} />}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </section>
    );
  }

  if (section === 'costs') {
    return (
      <section className="hq-panel ee-compact-panel" id="materials-costing">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">COSTS</span>
            <h2>Materials and job costing</h2>
          </div>
        </div>
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          Materials and cost rollups will appear here. No estimated or fabricated figures are
          shown until costing data is available.
        </p>
      </section>
    );
  }

  if (section === 'files') {
    return (
    <section className="hq-panel ee-compact-panel" id="notes-photos">
      <div className="ee-section-title">
        <div>
          <span className="ee-eyebrow">NOTES & FILES</span>
          <h2>Notes, photos and documents</h2>
        </div>
        <span className="ee-muted">
          {notes.length} note{notes.length === 1 ? '' : 's'} · {images.length} photo
          {images.length === 1 ? '' : 's'} · {documents.length} document
          {documents.length === 1 ? '' : 's'}
        </span>
      </div>

      <details className="ee-expand ee-job-row">
        <summary>
          <span className="ee-job-row-main">
            <strong>Add office note</strong>
            <span className="ee-muted">Office only or shared with technicians</span>
          </span>
          <span className="ee-expand-mark" aria-hidden="true">
            ＋
          </span>
        </summary>
        <div className="ee-job-row-body">
          <form action={addOfficeNoteAction} className="ee-edit-form">
            <input type="hidden" name="job_id" value={jobId} />
            <label>
              Note
              <textarea name="body" required maxLength={4000} rows={3} />
            </label>
            <label>
              Visibility
              <select name="visibility" defaultValue="office_only">
                <option value="office_only">Office only</option>
                <option value="shared">Shared with technicians</option>
              </select>
            </label>
            <button className="hq-detail-action-primary" type="submit">
              Save note
            </button>
          </form>
        </div>
      </details>

      {notes.length ? (
        <details className="ee-expand ee-job-row" open={notes.length <= 3}>
          <summary>
            <span className="ee-job-row-main">
              <strong>Notes</strong>
              <span className="ee-muted">{notes.length} on file</span>
            </span>
            <span className="ee-expand-mark" aria-hidden="true">
              ＋
            </span>
          </summary>
          <div className="ee-job-row-body">
            {notes.map((note) => (
              <div className="ee-event" key={note.id}>
                <span className="ee-event-dot" />
                <div>
                  <strong>
                    {note.authorName ?? 'Staff'} ·{' '}
                    {note.visibility === 'office_only' ? 'Office only' : 'Shared'}
                  </strong>
                  <p>{note.body}</p>
                  <small>{perthWhen(note.createdAt)}</small>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <p className="ee-muted">No notes yet.</p>
      )}

      <details className="ee-expand ee-job-row" open={images.length > 0 && images.length <= 4}>
        <summary>
          <span className="ee-job-row-main">
            <strong>Photos</strong>
            <span className="ee-muted">
              {images.length ? `${images.length} uploaded` : 'None yet'}
            </span>
          </span>
          <span className="ee-expand-mark" aria-hidden="true">
            ＋
          </span>
        </summary>
        <div className="ee-job-row-body">
          {images.length ? (
            <div className="ee-photo-grid">
              {images.map((photo) =>
                photo.signedUrl ? (
                  <figure key={photo.id}>
                    <a
                      href={photo.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={
                        [
                          photo.caption,
                          photo.uploadedByName ? `Uploaded by ${photo.uploadedByName}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Job photo'
                      }
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.signedUrl} alt={photo.caption || 'Job photo'} />
                    </a>
                    <figcaption className="ee-muted">
                      {photo.uploadedByName ?? 'Unknown uploader'}
                      {photo.caption ? ` · ${photo.caption}` : ''}
                    </figcaption>
                  </figure>
                ) : null,
              )}
            </div>
          ) : (
            <p className="ee-muted">No photos uploaded yet.</p>
          )}
        </div>
      </details>

      <details className="ee-expand ee-job-row" open={documents.length > 0 && documents.length <= 4}>
        <summary>
          <span className="ee-job-row-main">
            <strong>Documents</strong>
            <span className="ee-muted">
              {documents.length ? `${documents.length} on file` : 'None yet'}
            </span>
          </span>
          <span className="ee-expand-mark" aria-hidden="true">
            ＋
          </span>
        </summary>
        <div className="ee-job-row-body">
          {documents.length ? (
            documents.map((file) => (
              <div className="ee-visit" key={file.id}>
                <strong>{file.caption || 'Document'}</strong>
                <span>
                  {file.uploadedByName ?? 'Unknown uploader'}
                  {file.contentType ? ` · ${file.contentType}` : ''}
                </span>
                {file.signedUrl ? (
                  <a href={file.signedUrl} target="_blank" rel="noopener noreferrer">
                    Open document ↗
                  </a>
                ) : (
                  <span>Preview unavailable</span>
                )}
              </div>
            ))
          ) : (
            <p className="ee-muted">No documents uploaded for this job.</p>
          )}
        </div>
      </details>
    </section>
  );
  }

  return null;
}

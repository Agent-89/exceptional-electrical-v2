import Link from 'next/link';
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

type PhotoView = {
  id: string;
  signedUrl: string | null;
  caption: string | null;
  uploadedByName: string | null;
};

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

export default function JobFieldActivity({
  jobId,
  appointments,
  techReports,
  timeEntries,
  notes,
  photos,
  showSummary = true,
  showAttention = true,
}: {
  jobId: string;
  appointments: JobDetailAppointment[];
  techReports: JobDetailTechReport[];
  timeEntries: JobDetailTimeEntry[];
  notes: NoteView[];
  photos: PhotoView[];
  showSummary?: boolean;
  showAttention?: boolean;
}) {
  const labour = jobLabourTotals(jobId, timeEntries);
  const pendingApprovals = timeEntries.filter((e) => isPendingApprovalStatus(e.status));
  const liveEntries = timeEntries.filter((e) => isLiveTimeStatus(e.status));
  const timeGroups = groupTimeEntriesByTechnicianDate(timeEntries);
  const attention = buildJobAttentionItems({ appointments, techReports, timeEntries });
  const visitStats = visitReportStatusCounts({ appointments, techReports });

  return (
    <>
      {showSummary ? (
        <section className="hq-panel ee-compact-panel" id="job-summary">
          <div className="ee-section-title">
            <div>
              <span className="ee-eyebrow">SUMMARY</span>
              <h2>At a glance</h2>
            </div>
          </div>
          <div className="ee-job-stat-grid">
            <div>
              <span className="ee-eyebrow">LABOUR RECORDED</span>
              <strong>
                {labour
                  ? formatDurationMinutes(labour.totalWorkedMinutes)
                  : 'None yet'}
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
              <span className="ee-eyebrow">PENDING APPROVALS</span>
              <strong>
                {pendingApprovals.length
                  ? `${pendingApprovals.length} waiting`
                  : 'None'}
              </strong>
              <span className="ee-muted">
                {pendingApprovals.length
                  ? `${formatDurationMinutes(
                      pendingApprovals.reduce(
                        (acc, e) => acc + Math.max(0, e.workedMinutes ?? 0),
                        0,
                      ),
                    )} worked`
                  : 'Submitted / corrected entries'}
              </span>
            </div>
            <div>
              <span className="ee-eyebrow">VISITS & REPORTS</span>
              <strong>
                {visitStats.reportCount} report{visitStats.reportCount === 1 ? '' : 's'}
              </strong>
              <span className="ee-muted">
                {visitStats.visitCount} visit{visitStats.visitCount === 1 ? '' : 's'} ·{' '}
                {visitStats.finalisedCount} finalised
                {visitStats.pendingOutcomeCount
                  ? ` · ${visitStats.pendingOutcomeCount} open outcome${visitStats.pendingOutcomeCount === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {showAttention && attention.length ? (
        <section className="hq-panel ee-compact-panel ee-attention" id="requires-attention">
          <div className="ee-section-title">
            <div>
              <span className="ee-eyebrow">REQUIRES ATTENTION</span>
              <h2>Outstanding actions</h2>
            </div>
            <span className="ee-muted">{attention.length}</span>
          </div>
          <ul className="ee-attention-list">
            {attention.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span className="ee-muted">{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="hq-panel ee-compact-panel" id="visits-reports">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">VISITS</span>
            <h2>Visits &amp; technician reports</h2>
          </div>
          <span className="ee-muted">{appointments.length}</span>
        </div>
        {appointments.length ? (
          appointments.map((a) => {
            const reportsForVisit = techReports.filter((r) => r.appointmentId === a.id);
            const crew =
              a.electricianNames && a.electricianNames.length
                ? a.electricianNames.join(', ')
                : 'Visit crew not listed';
            return (
              <details className="ee-expand ee-job-row" key={a.id}>
                <summary>
                  <span className="ee-job-row-main">
                    <strong>{perthDayTime(a.startsAt, a.endsAt)}</strong>
                    <span className="ee-muted">
                      {FIELD_STATUS_LABELS[a.fieldStatus as FieldStatus] ?? a.fieldStatus}
                      {a.followUp ? ' · Further visit' : ''}
                      {reportsForVisit.length
                        ? ` · ${reportsForVisit.length} report${reportsForVisit.length === 1 ? '' : 's'}`
                        : ' · No reports'}
                    </span>
                  </span>
                  <span aria-hidden="true">＋</span>
                </summary>
                <div className="ee-job-row-body">
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Schedule {a.status} · Visit electricians: {crew}
                  </p>

                  <div className="ee-job-subblock">
                    <strong>Shared office summary</strong>
                    {a.completionNote ? <p>{a.completionNote}</p> : null}
                    {a.outstanding ? <p>Outstanding: {a.outstanding}</p> : null}
                    {a.issues ? <p>Issues: {a.issues}</p> : null}
                    {!a.completionNote && !a.outstanding && !a.issues ? (
                      <p className="ee-muted">No shared summary yet.</p>
                    ) : null}
                    <p className="ee-muted" style={{ marginBottom: 0 }}>
                      Further visit required: {a.followUp ? 'Yes' : 'No'}
                      {isTerminalVisitOutcome(a.fieldStatus) ? ' · Finalised' : ''}
                    </p>
                  </div>

                  <div className="ee-job-subblock">
                    <strong>Technician reports</strong>
                    {reportsForVisit.length ? (
                      <ul className="ee-report-summaries">
                        {reportsForVisit.map((r) => (
                          <li key={r.id}>
                            <details className="ee-expand ee-nested-expand">
                              <summary>
                                <span>
                                  <strong>{r.technicianName ?? 'Technician'}</strong>
                                  <span className="ee-muted">
                                    {' '}
                                    · {summarizeTechReport(r)}
                                  </span>
                                </span>
                                <span aria-hidden="true">＋</span>
                              </summary>
                              <div className="ee-job-row-body">
                                <p className="ee-muted" style={{ marginTop: 0 }}>
                                  {VISIT_OUTCOME_LABELS[r.progressStatus as VisitOutcomeStatus] ??
                                    r.progressStatus}{' '}
                                  · Updated {perthWhen(r.updatedAt)}
                                </p>
                                {r.workSummary ? <p>{r.workSummary}</p> : null}
                                {r.outstandingWork ? (
                                  <p>Outstanding: {r.outstandingWork}</p>
                                ) : null}
                                {r.issues ? <p>Issues: {r.issues}</p> : null}
                                <p className="ee-muted" style={{ marginBottom: 0 }}>
                                  Further visit: {r.followUpRequired ? 'Yes' : 'No'}
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

                  {!isTerminalVisitOutcome(a.fieldStatus) ? (
                    <OfficeVisitOutcomeForm
                      appointmentId={a.id}
                      fieldStatus={a.fieldStatus}
                      completionNote={a.completionNote}
                      outstanding={a.outstanding}
                      issues={a.issues}
                      followUp={a.followUp}
                    />
                  ) : null}
                </div>
              </details>
            );
          })
        ) : (
          <p className="ee-muted">No visits yet.</p>
        )}
      </section>

      <section className="hq-panel ee-compact-panel" id="time-labour">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">TIME</span>
            <h2>Time &amp; labour</h2>
          </div>
          <Link href="/hq/timesheets" className="ee-text-action">
            Timesheets →
          </Link>
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
            {pendingApprovals.map((e) => (
              <div className="ee-visit ee-pending-row" key={e.id}>
                <strong>
                  {e.staffName} · {formatDurationMinutes(e.workedMinutes ?? 0)} · {e.status}
                </strong>
                <span>
                  {perthWhen(e.startedAt)}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
                <form action={reviewTimeEntryAction} className="ee-job-inline" style={{ marginTop: 8 }}>
                  <input type="hidden" name="entry_id" value={e.id} />
                  <input type="hidden" name="billable_minutes" value={e.workedMinutes ?? 0} />
                  <button type="submit" name="decision" value="approve">
                    Approve worked time
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : null}

        {labour ? (
          <p className="ee-muted" style={{ marginTop: pendingApprovals.length ? 12 : 0 }}>
            Recorded labour {formatDurationMinutes(labour.totalWorkedMinutes)} worked · Breaks{' '}
            {formatDurationMinutes(labour.totalBreakMinutes)} · Billable{' '}
            {formatDurationMinutes(labour.totalBillableMinutes)}
            {labour.billableUnsetCount ? ` · ${labour.billableUnsetCount} unset` : ''}. Live
            timers are excluded from these totals.
          </p>
        ) : (
          <p className="ee-muted">No finished technician time recorded yet.</p>
        )}

        {timeGroups.length ? (
          <div className="ee-time-groups">
            {timeGroups.map((group) => (
              <details className="ee-expand ee-job-row" key={group.key}>
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
                  <span aria-hidden="true">＋</span>
                </summary>
                <div className="ee-job-row-body">
                  {group.entries.map((e) => (
                    <div className="ee-visit" key={e.id}>
                      <strong>
                        {isLiveTimeStatus(e.status)
                          ? `Live · ${e.status.replaceAll('_', ' ')}`
                          : `${formatDurationMinutes(e.workedMinutes ?? 0)} worked · ${e.status}`}
                      </strong>
                      <span>
                        {perthWhen(e.startedAt)}
                        {e.endedAt
                          ? ` – ${new Date(e.endedAt).toLocaleTimeString('en-AU', {
                              timeZone: 'Australia/Perth',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}`
                          : ' – open'}
                        {' · Break '}
                        {formatDurationMinutes(e.breakMinutes)}
                        {e.billableMinutes != null
                          ? ` · Billable ${formatDurationMinutes(e.billableMinutes)}`
                          : isLiveTimeStatus(e.status)
                            ? ''
                            : ' · Billable not set'}
                      </span>
                      {e.note ? <p>{e.note}</p> : null}
                      {isPendingApprovalStatus(e.status) ? (
                        <form
                          action={reviewTimeEntryAction}
                          className="ee-job-inline"
                          style={{ marginTop: 8 }}
                        >
                          <input type="hidden" name="entry_id" value={e.id} />
                          <input
                            type="hidden"
                            name="billable_minutes"
                            value={e.workedMinutes ?? 0}
                          />
                          <button type="submit" name="decision" value="approve">
                            Approve worked time
                          </button>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </section>

      <section className="hq-panel ee-compact-panel" id="materials-costing">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">COSTING</span>
            <h2>Materials &amp; job costing</h2>
          </div>
        </div>
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          Materials and cost rollups will appear here. No estimated or fabricated figures are
          shown until costing data is available.
        </p>
      </section>

      <section className="hq-panel ee-compact-panel" id="notes-photos">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">NOTES & PHOTOS</span>
            <h2>Notes and photos</h2>
          </div>
          <span className="ee-muted">
            {notes.length} note{notes.length === 1 ? '' : 's'} · {photos.length} photo
            {photos.length === 1 ? '' : 's'}
          </span>
        </div>

        <details className="ee-expand ee-job-row">
          <summary>
            <span className="ee-job-row-main">
              <strong>Add office note</strong>
              <span className="ee-muted">Office only or shared with technicians</span>
            </span>
            <span aria-hidden="true">＋</span>
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
              <span aria-hidden="true">＋</span>
            </summary>
            <div className="ee-job-row-body">
              {notes.map((n) => (
                <div className="ee-event" key={n.id}>
                  <span className="ee-event-dot" />
                  <div>
                    <strong>
                      {n.authorName ?? 'Staff'} ·{' '}
                      {n.visibility === 'office_only' ? 'Office only' : 'Shared'}
                    </strong>
                    <p>{n.body}</p>
                    <small>{perthWhen(n.createdAt)}</small>
                  </div>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <p className="ee-muted">No notes yet.</p>
        )}

        <details className="ee-expand ee-job-row" open={photos.length > 0 && photos.length <= 4}>
          <summary>
            <span className="ee-job-row-main">
              <strong>Photos</strong>
              <span className="ee-muted">
                {photos.length ? `${photos.length} uploaded` : 'None yet'}
              </span>
            </span>
            <span aria-hidden="true">＋</span>
          </summary>
          <div className="ee-job-row-body">
            {photos.length ? (
              <div className="ee-photo-grid">
                {photos.map((p) =>
                  p.signedUrl ? (
                    <figure key={p.id}>
                      <a
                        href={p.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={
                          [p.caption, p.uploadedByName ? `Uploaded by ${p.uploadedByName}` : null]
                            .filter(Boolean)
                            .join(' · ') || 'Job photo'
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.signedUrl} alt={p.caption || 'Job photo'} />
                      </a>
                      <figcaption className="ee-muted">
                        {p.uploadedByName ?? 'Unknown uploader'}
                        {p.caption ? ` · ${p.caption}` : ''}
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
      </section>
    </>
  );
}

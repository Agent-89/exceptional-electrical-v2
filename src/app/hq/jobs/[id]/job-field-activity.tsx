import Link from 'next/link';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import { aggregateLabourByJob } from '@/lib/tech-time-multi';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import {
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOME_STATUSES,
  isTerminalVisitOutcome,
} from '@/lib/tech-visit-report';
import {
  addOfficeNoteAction,
  officeUpdateVisitOutcomeAction,
  reviewTimeEntryAction,
} from '@/app/hq/tech/actions';

type AppointmentView = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  fieldStatus: string;
  followUp: boolean;
  completionNote: string | null;
  outstanding: string | null;
  issues: string | null;
};

type TimeView = {
  id: string;
  staffName: string;
  technicianUserId: string;
  appointmentId: string | null;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
  status: string;
  note: string | null;
};

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
};

export default function JobFieldActivity({
  jobId,
  appointments,
  timeEntries,
  notes,
  photos,
}: {
  jobId: string;
  appointments: AppointmentView[];
  timeEntries: TimeView[];
  notes: NoteView[];
  photos: PhotoView[];
}) {
  const labour = aggregateLabourByJob(
    timeEntries.map((e) => ({
      jobId,
      technicianUserId: e.technicianUserId,
      appointmentId: e.appointmentId,
      workedMinutes: e.workedMinutes,
      billableMinutes: e.billableMinutes,
      breakMinutes: e.breakMinutes,
      status: e.status,
    })),
  )[0];

  return (
    <>
      <section className="hq-panel ee-compact-panel">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">FIELD</span>
            <h2>Visit reports</h2>
          </div>
        </div>
        {appointments.length ? (
          appointments.map((a) => {
            const entriesForVisit = timeEntries.filter((e) => e.appointmentId === a.id);
            const techCount = new Set(entriesForVisit.map((e) => e.technicianUserId)).size;
            return (
              <div className="ee-visit" key={a.id}>
                <strong>
                  {new Date(a.startsAt).toLocaleDateString('en-AU', {
                    timeZone: 'Australia/Perth',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  ·{' '}
                  {new Date(a.startsAt).toLocaleTimeString('en-AU', {
                    timeZone: 'Australia/Perth',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  –{' '}
                  {new Date(a.endsAt).toLocaleTimeString('en-AU', {
                    timeZone: 'Australia/Perth',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </strong>
                <span>
                  Schedule {a.status} · Visit outcome{' '}
                  {FIELD_STATUS_LABELS[a.fieldStatus as FieldStatus] ?? a.fieldStatus}
                  {a.followUp ? ' · Further visit required' : ''}
                  {techCount > 1 ? ` · ${techCount} technicians timed` : ''}
                </span>
                {a.completionNote ? <p>Work completed: {a.completionNote}</p> : null}
                {a.outstanding ? <p>Outstanding work: {a.outstanding}</p> : null}
                {a.issues ? <p>Issues encountered: {a.issues}</p> : null}
                <p className="ee-muted" style={{ marginBottom: 0 }}>
                  Further visit required: {a.followUp ? 'Yes' : 'No'}
                </p>
                {!isTerminalVisitOutcome(a.fieldStatus) ? (
                  <form action={officeUpdateVisitOutcomeAction} className="ee-edit-form" style={{ marginTop: 12 }}>
                    <input type="hidden" name="appointment_id" value={a.id} />
                    <input type="hidden" name="completion_note" value={a.completionNote ?? ''} />
                    <input type="hidden" name="outstanding_work" value={a.outstanding ?? ''} />
                    <input type="hidden" name="issues" value={a.issues ?? ''} />
                    {a.followUp ? <input type="hidden" name="follow_up_required" value="yes" /> : null}
                    <label>
                      Set shared visit outcome
                      <select name="field_status" defaultValue={a.fieldStatus === 'paused' || a.fieldStatus === 'scheduled' ? 'in_progress' : a.fieldStatus}>
                        {VISIT_OUTCOME_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {VISIT_OUTCOME_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="hq-detail-action-primary" type="submit">
                      Save visit outcome
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="ee-muted">No visits yet.</p>
        )}
      </section>

      <section className="hq-panel ee-compact-panel">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">TIME</span>
            <h2>Individual technician time entries</h2>
          </div>
          <Link href="/hq/timesheets" className="ee-text-action">
            Timesheets →
          </Link>
        </div>
        {labour ? (
          <p className="ee-muted" style={{ marginTop: 0 }}>
            Job labour: {formatDurationMinutes(labour.totalWorkedMinutes)} worked across{' '}
            {labour.technicianCount} technician{labour.technicianCount === 1 ? '' : 's'} (
            {labour.entryCount} entries). Breaks {formatDurationMinutes(labour.totalBreakMinutes)}.
            Billable {formatDurationMinutes(labour.totalBillableMinutes)}
            {labour.billableUnsetCount ? ` · ${labour.billableUnsetCount} unset` : ''}.
          </p>
        ) : null}
        {timeEntries.length ? (
          timeEntries.map((e) => (
            <div className="ee-visit" key={e.id}>
              <strong>
                {e.staffName} · {formatDurationMinutes(e.workedMinutes ?? 0)} worked · {e.status}
              </strong>
              <span>
                {new Date(e.startedAt).toLocaleString('en-AU', {
                  timeZone: 'Australia/Perth',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {e.endedAt
                  ? ' – ' +
                    new Date(e.endedAt).toLocaleTimeString('en-AU', {
                      timeZone: 'Australia/Perth',
                      hour: 'numeric',
                      minute: '2-digit',
                    })
                  : ' – open'}
                {' · Break '}
                {formatDurationMinutes(e.breakMinutes)}
                {e.billableMinutes != null
                  ? ` · Billable ${formatDurationMinutes(e.billableMinutes)}`
                  : ' · Billable not set'}
              </span>
              {e.note ? <p>{e.note}</p> : null}
              {['submitted', 'rejected', 'corrected'].includes(e.status) ? (
                <form action={reviewTimeEntryAction} className="ee-job-inline" style={{ marginTop: 8 }}>
                  <input type="hidden" name="entry_id" value={e.id} />
                  <input type="hidden" name="billable_minutes" value={e.workedMinutes ?? 0} />
                  <button type="submit" name="decision" value="approve">
                    Approve worked time
                  </button>
                </form>
              ) : null}
            </div>
          ))
        ) : (
          <p className="ee-muted">No technician time recorded yet.</p>
        )}
      </section>

      <section className="hq-panel ee-compact-panel">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">NOTES</span>
            <h2>Technician & office notes</h2>
          </div>
        </div>
        <form action={addOfficeNoteAction} className="ee-edit-form" style={{ marginBottom: 16 }}>
          <input type="hidden" name="job_id" value={jobId} />
          <label>
            Add office note
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
        {notes.length ? (
          notes.map((n) => (
            <div className="ee-event" key={n.id}>
              <span className="ee-event-dot" />
              <div>
                <strong>
                  {n.authorName ?? 'Staff'} · {n.visibility === 'office_only' ? 'Office only' : 'Shared'}
                </strong>
                <p>{n.body}</p>
                <small>
                  {new Date(n.createdAt).toLocaleString('en-AU', {
                    timeZone: 'Australia/Perth',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p className="ee-muted">No notes yet.</p>
        )}
      </section>

      <section className="hq-panel ee-compact-panel">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">PHOTOS</span>
            <h2>Job photos</h2>
          </div>
        </div>
        {photos.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
            {photos.map((p) =>
              p.signedUrl ? (
                <a
                  key={p.id}
                  href={p.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    aspectRatio: '1',
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: '1px solid #e1eaf1',
                  }}
                  title={p.caption ?? 'Job photo'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.signedUrl} alt={p.caption || 'Job photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </a>
              ) : null,
            )}
          </div>
        ) : (
          <p className="ee-muted">No photos uploaded yet.</p>
        )}
      </section>
    </>
  );
}

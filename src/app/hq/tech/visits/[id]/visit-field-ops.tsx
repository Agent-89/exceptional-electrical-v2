'use client';

import { useFormStatus } from 'react-dom';
import {
  addManualTimeEntryAction,
  addTechnicianNoteAction,
  finishWorkAction,
  pauseWorkAction,
  resumeWorkAction,
  startWorkAction,
  updateVisitProgressAction,
  uploadJobPhotoAction,
} from '../../actions';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import {
  VISIT_OUTCOME_HINTS,
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOME_STATUSES,
  canTechnicianFinaliseSharedVisit,
  defaultVisitOutcomeForForm,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';

type TimeEntryView = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  liveWorkedMinutes: number;
  liveBreakMinutes: number;
  note: string | null;
  entrySource: string;
};

type NoteView = {
  id: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
  isOwn: boolean;
};

type PhotoView = {
  id: string;
  signedUrl: string | null;
  caption: string | null;
  createdAt: string;
};

type Props = {
  appointmentId: string;
  appointmentDateLabel: string;
  scheduledLabel: string;
  scheduledMinutes: number;
  fieldStatus: FieldStatus;
  assignedTechnicianCount: number;
  timeRecorded: boolean;
  activeEntry: TimeEntryView | null;
  entries: TimeEntryView[];
  notes: NoteView[];
  photos: PhotoView[];
  completionNote: string | null;
  outstandingWork: string | null;
  issues: string | null;
  followUpRequired: boolean;
};

function SubmitButton({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? 'Working…' : label}
    </button>
  );
}

export default function VisitFieldOps({
  appointmentId,
  appointmentDateLabel,
  scheduledLabel,
  scheduledMinutes,
  fieldStatus,
  assignedTechnicianCount,
  timeRecorded,
  activeEntry,
  entries,
  notes,
  photos,
  completionNote,
  outstandingWork,
  issues,
  followUpRequired,
}: Props) {
  const timerForThisVisit = activeEntry && activeEntry.id ? activeEntry : null;
  const canFinalise = canTechnicianFinaliseSharedVisit(assignedTechnicianCount);
  const selectableOutcomes: VisitOutcomeStatus[] = canFinalise
    ? [...VISIT_OUTCOME_STATUSES]
    : ['in_progress'];
  const defaultOutcome = defaultVisitOutcomeForForm(fieldStatus);
  const formDefault = selectableOutcomes.includes(defaultOutcome)
    ? defaultOutcome
    : 'in_progress';

  return (
    <div className="ee-tech-stack">
      <section className="ee-tech-panel">
        <h2>Work timer</h2>
        <div className="ee-tech-timer">
          <div className="ee-tech-timer-readout">
            <span>Scheduled · {scheduledLabel}</span>
            <strong>
              {timerForThisVisit
                ? formatDurationMinutes(timerForThisVisit.liveWorkedMinutes)
                : formatDurationMinutes(0)}
            </strong>
            <span>
              Actual worked
              {timerForThisVisit
                ? ` · Break ${formatDurationMinutes(timerForThisVisit.liveBreakMinutes)} · ${timerForThisVisit.status.replaceAll('_', ' ')}`
                : ' · No active timer on this visit'}
            </span>
            <span>Scheduled duration {formatDurationMinutes(scheduledMinutes)} (unchanged by timer)</span>
          </div>

          {timeRecorded && !timerForThisVisit ? (
            <div className="ee-tech-alert ee-tech-alert-success" role="status">
              <p style={{ margin: 0 }}>Time recorded. Complete your visit report when you&apos;re ready.</p>
              <a className="ee-tech-btn ee-tech-btn-secondary" href="#visit-report" style={{ marginTop: 8 }}>
                Go to Visit Report
              </a>
            </div>
          ) : null}

          {!timerForThisVisit ? (
            <form action={startWorkAction} className="ee-tech-actions">
              <input type="hidden" name="appointment_id" value={appointmentId} />
              <SubmitButton label="Start work" className="ee-tech-btn ee-tech-btn-primary" />
            </form>
          ) : timerForThisVisit.status === 'active' ? (
            <div className="ee-tech-actions">
              <form action={pauseWorkAction}>
                <input type="hidden" name="appointment_id" value={appointmentId} />
                <input type="hidden" name="entry_id" value={timerForThisVisit.id} />
                <SubmitButton label="Start break" className="ee-tech-btn ee-tech-btn-secondary" />
              </form>
              <form action={finishWorkAction}>
                <input type="hidden" name="appointment_id" value={appointmentId} />
                <input type="hidden" name="entry_id" value={timerForThisVisit.id} />
                <SubmitButton label="Finish work" className="ee-tech-btn ee-tech-btn-primary" />
              </form>
            </div>
          ) : (
            <div className="ee-tech-actions">
              <form action={resumeWorkAction}>
                <input type="hidden" name="appointment_id" value={appointmentId} />
                <input type="hidden" name="entry_id" value={timerForThisVisit.id} />
                <SubmitButton label="Resume work" className="ee-tech-btn ee-tech-btn-primary" />
              </form>
              <form action={finishWorkAction}>
                <input type="hidden" name="appointment_id" value={appointmentId} />
                <input type="hidden" name="entry_id" value={timerForThisVisit.id} />
                <SubmitButton label="Finish work" className="ee-tech-btn ee-tech-btn-secondary" />
              </form>
            </div>
          )}

          <details>
            <summary>Add manual time entry</summary>
            <form action={addManualTimeEntryAction} className="ee-tech-form" style={{ marginTop: 12 }}>
              <input type="hidden" name="appointment_id" value={appointmentId} />
              <label>
                Started (Perth)
                <input type="datetime-local" name="started_at" required step={60} />
              </label>
              <label>
                Ended (Perth)
                <input type="datetime-local" name="ended_at" required step={60} />
              </label>
              <label>
                Break minutes
                <input type="number" name="break_minutes" min={0} max={1440} defaultValue={0} />
              </label>
              <label>
                Note (optional)
                <input name="note" maxLength={2000} />
              </label>
              <SubmitButton label="Save manual entry" className="ee-tech-btn ee-tech-btn-secondary" />
            </form>
          </details>
        </div>

        {entries.length ? (
          <div style={{ marginTop: 14 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f7a8f' }}>
              Recorded time
            </h3>
            {entries.map((e) => (
              <div className="ee-tech-time-row" key={e.id}>
                <strong>
                  {formatDurationMinutes(e.workedMinutes ?? e.liveWorkedMinutes)} worked ·{' '}
                  {e.status.replaceAll('_', ' ')}
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
                    : ' – running'}
                  {' · Break '}
                  {formatDurationMinutes(e.breakMinutes)}
                  {' · '}
                  {e.entrySource}
                </span>
                {e.note ? <span>{e.note}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="ee-tech-panel" id="visit-report">
        <h2>Visit Report</h2>
        <dl className="ee-tech-dl" style={{ marginBottom: 12 }}>
          <div>
            <dt>Appointment</dt>
            <dd>
              {appointmentDateLabel}
              <br />
              {scheduledLabel}
            </dd>
          </div>
          <div>
            <dt>Current visit outcome</dt>
            <dd>{FIELD_STATUS_LABELS[fieldStatus]}</dd>
          </div>
        </dl>
        <p className="ee-tech-muted" style={{ marginTop: 0 }}>
          Completing a visit does not close the overall job. Save anytime — fields are optional while the visit is
          in progress.
        </p>
        {!canFinalise ? (
          <p className="ee-tech-alert" role="status" style={{ marginTop: 0 }}>
            {assignedTechnicianCount} technicians are assigned to this visit. Save your own work notes here as
            in progress. The office sets the shared visit outcome when the team is done.
          </p>
        ) : null}
        <form action={updateVisitProgressAction} className="ee-tech-form">
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <fieldset className="ee-tech-outcome">
            <legend>Visit outcome</legend>
            {selectableOutcomes.map((key) => (
              <label key={key} className="ee-tech-outcome-option">
                <input
                  type="radio"
                  name="field_status"
                  value={key}
                  defaultChecked={formDefault === key}
                  required
                />
                <span>
                  <strong>{VISIT_OUTCOME_LABELS[key]}</strong>
                  <small>{VISIT_OUTCOME_HINTS[key]}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Work completed / summary
            <textarea name="completion_note" maxLength={2000} defaultValue={completionNote ?? ''} />
          </label>
          <label>
            Outstanding work
            <textarea name="outstanding_work" maxLength={2000} defaultValue={outstandingWork ?? ''} />
          </label>
          <label>
            Issues encountered
            <textarea name="issues" maxLength={2000} defaultValue={issues ?? ''} />
          </label>
          <label className="ee-tech-check">
            <input type="checkbox" name="follow_up_required" value="yes" defaultChecked={followUpRequired} />
            Further visit required
          </label>
          <SubmitButton
            label={canFinalise ? 'Save visit report' : 'Save my visit notes'}
            className="ee-tech-btn ee-tech-btn-primary"
          />
        </form>
      </section>

      <section className="ee-tech-panel">
        <h2>Work notes</h2>
        <form action={addTechnicianNoteAction} className="ee-tech-form">
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <label>
            Add note
            <textarea name="body" required maxLength={4000} placeholder="What did you find on site?" />
          </label>
          <SubmitButton label="Add note" className="ee-tech-btn ee-tech-btn-secondary" />
        </form>
        {notes.length ? (
          notes.map((n) => (
            <div className="ee-tech-note" key={n.id}>
              <p>{n.body}</p>
              <small>
                {n.authorName ?? 'Technician'} ·{' '}
                {new Date(n.createdAt).toLocaleString('en-AU', {
                  timeZone: 'Australia/Perth',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
                {n.editedAt ? ' · edited' : ''}
                {n.isOwn ? ' · yours' : ''}
              </small>
            </div>
          ))
        ) : (
          <p className="ee-tech-muted">No technician notes yet.</p>
        )}
      </section>

      <section className="ee-tech-panel">
        <h2>Job photos</h2>
        <form action={uploadJobPhotoAction} className="ee-tech-form" encType="multipart/form-data">
          <input type="hidden" name="appointment_id" value={appointmentId} />
          <label>
            Upload from camera or library
            <input type="file" name="photo" accept="image/*" capture="environment" required />
          </label>
          <label>
            Caption (optional)
            <input name="caption" maxLength={500} />
          </label>
          <SubmitButton label="Upload photo" className="ee-tech-btn ee-tech-btn-secondary" />
        </form>
        {photos.length ? (
          <div className="ee-tech-gallery" style={{ marginTop: 12 }}>
            {photos.map((p) =>
              p.signedUrl ? (
                <a key={p.id} href={p.signedUrl} target="_blank" rel="noopener noreferrer" title={p.caption ?? 'Job photo'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.signedUrl} alt={p.caption || 'Job photo'} />
                </a>
              ) : (
                <figure key={p.id}>
                  <span className="ee-tech-muted" style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12 }}>
                    Unavailable
                  </span>
                </figure>
              ),
            )}
          </div>
        ) : (
          <p className="ee-tech-muted">No photos uploaded for this visit yet.</p>
        )}
      </section>
    </div>
  );
}

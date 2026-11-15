'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import HqToast, { type HqToastMessage } from '@/app/hq/hq-toast';
import {
  addManualTimeEntryAction,
  addTechnicianNoteAction,
  finishWorkAction,
  pauseWorkAction,
  resumeWorkAction,
  startWorkAction,
  updateVisitProgressAction,
  uploadJobPhotoAction,
  type TechFieldActionResult,
} from '../../actions';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import {
  VISIT_OUTCOME_HINTS,
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOME_STATUSES,
  canTechnicianFinaliseSharedVisit,
  isTerminalVisitOutcome,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';

/** Soft poll while live timers exist — keeps multi-tech status fresh without Realtime. */
const LIVE_TIMER_POLL_MS = 20_000;

type TimeEntryView = {
  id: string;
  staffName: string;
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
  personalProgressStatus: VisitOutcomeStatus;
  techReportUpdatedAt: string | null;
  sharedCompletionNote: string | null;
  sharedOutstandingWork: string | null;
  sharedIssues: string | null;
  sharedFollowUpRequired: boolean;
  hasPersonalReport: boolean;
};

type BusyKind = 'timer' | 'report' | 'note' | 'manual' | 'photo' | null;

function statusLabel(status: string): string {
  if (status === 'active') return 'Active';
  if (status === 'on_break') return 'On break';
  if (status === 'submitted') return 'Submitted';
  return status.replaceAll('_', ' ');
}

function statusClass(status: string): string {
  if (status === 'active') return 'ee-tech-entry-active';
  if (status === 'on_break') return 'ee-tech-entry-break';
  if (status === 'submitted' || status === 'approved') return 'ee-tech-entry-submitted';
  return 'ee-tech-entry-other';
}

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    String((error as { digest?: string }).digest || '').startsWith('NEXT_REDIRECT')
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
  personalProgressStatus,
  techReportUpdatedAt,
  sharedCompletionNote,
  sharedOutstandingWork,
  sharedIssues,
  sharedFollowUpRequired,
  hasPersonalReport,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<HqToastMessage | null>(null);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [timerPendingLabel, setTimerPendingLabel] = useState<string | null>(null);
  const [reportPending, setReportPending] = useState(false);
  const [reportSavedFlash, setReportSavedFlash] = useState(false);
  const [lastTimerMs, setLastTimerMs] = useState<number | null>(null);
  const reportDirty = useRef(false);
  const noteDirty = useRef(false);

  // Shared appointment snapshot (for solo finalisation concurrency).
  const [expectedStatus, setExpectedStatus] = useState(fieldStatus);
  const [expectedCompletion, setExpectedCompletion] = useState(sharedCompletionNote ?? '');
  const [expectedOutstanding, setExpectedOutstanding] = useState(sharedOutstandingWork ?? '');
  const [expectedIssues, setExpectedIssues] = useState(sharedIssues ?? '');
  const [expectedFollowUp, setExpectedFollowUp] = useState(sharedFollowUpRequired);
  const [expectedTechUpdatedAt, setExpectedTechUpdatedAt] = useState(techReportUpdatedAt);

  const [outcome, setOutcome] = useState<VisitOutcomeStatus>(personalProgressStatus);
  const [completion, setCompletion] = useState(completionNote ?? '');
  const [outstanding, setOutstanding] = useState(outstandingWork ?? '');
  const [issuesText, setIssuesText] = useState(issues ?? '');
  const [followUp, setFollowUp] = useState(followUpRequired);
  const [noteBody, setNoteBody] = useState('');

  const showToast = useCallback((tone: HqToastMessage['tone'], text: string) => {
    setToast({ id: Date.now(), tone, text });
  }, []);

  // Sync server props into the form only when the user is not mid-edit.
  useEffect(() => {
    if (reportDirty.current) return;
    setExpectedStatus(fieldStatus);
    setExpectedCompletion(sharedCompletionNote ?? '');
    setExpectedOutstanding(sharedOutstandingWork ?? '');
    setExpectedIssues(sharedIssues ?? '');
    setExpectedFollowUp(sharedFollowUpRequired);
    setExpectedTechUpdatedAt(techReportUpdatedAt);
    setOutcome(personalProgressStatus);
    setCompletion(completionNote ?? '');
    setOutstanding(outstandingWork ?? '');
    setIssuesText(issues ?? '');
    setFollowUp(followUpRequired);
  }, [
    fieldStatus,
    completionNote,
    outstandingWork,
    issues,
    followUpRequired,
    personalProgressStatus,
    techReportUpdatedAt,
    sharedCompletionNote,
    sharedOutstandingWork,
    sharedIssues,
    sharedFollowUpRequired,
  ]);

  const refreshSoft = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  // Multi-tech freshness: focus/visibility + low-frequency poll while live timers exist.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSoft();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refreshSoft]);

  useEffect(() => {
    const hasLive =
      Boolean(activeEntry) ||
      entries.some((e) => e.status === 'active' || e.status === 'on_break');
    if (!hasLive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible' && busy === null) refreshSoft();
    }, LIVE_TIMER_POLL_MS);
    return () => window.clearInterval(id);
  }, [activeEntry, entries, busy, refreshSoft]);

  const markReportDirty = () => {
    reportDirty.current = true;
    setReportSavedFlash(false);
  };

  async function runAction(
    kind: BusyKind,
    action: (fd: FormData) => Promise<TechFieldActionResult>,
    formData: FormData,
    opts?: { pendingLabel?: string; successToast?: string; onSuccess?: () => void },
  ): Promise<boolean> {
    if (busy) return false;
    setBusy(kind);
    if (opts?.pendingLabel) setTimerPendingLabel(opts.pendingLabel);
    const started = performance.now();
    try {
      const result = await action(formData);
      const elapsed = Math.round(performance.now() - started);
      if (kind === 'timer') setLastTimerMs(elapsed);
      if (!result.ok) {
        showToast('error', result.error);
        return false;
      }
      opts?.onSuccess?.();
      if (opts?.successToast) {
        showToast('success', result.noop ? result.message || opts.successToast : opts.successToast);
      }
      refreshSoft();
      return true;
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      showToast('error', 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(null);
      setTimerPendingLabel(null);
    }
  }

  const timerForThisVisit = activeEntry && activeEntry.id ? activeEntry : null;
  const canFinalise = canTechnicianFinaliseSharedVisit(assignedTechnicianCount);
  const sharedFinalised = isTerminalVisitOutcome(fieldStatus);
  // Personal work report always allows the full progress set.
  const selectableOutcomes: VisitOutcomeStatus[] = [...VISIT_OUTCOME_STATUSES];
  const formDefault = selectableOutcomes.includes(outcome) ? outcome : 'in_progress';
  const timerLocked = busy === 'timer';

  async function onStartWork() {
    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    await runAction('timer', startWorkAction, fd, {
      pendingLabel: 'Starting…',
      successToast: 'Work started',
    });
  }

  async function onPauseWork() {
    if (!timerForThisVisit) return;
    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    fd.set('entry_id', timerForThisVisit.id);
    await runAction('timer', pauseWorkAction, fd, {
      pendingLabel: 'Starting break…',
      successToast: 'Break started',
    });
  }

  async function onResumeWork() {
    if (!timerForThisVisit) return;
    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    fd.set('entry_id', timerForThisVisit.id);
    await runAction('timer', resumeWorkAction, fd, {
      pendingLabel: 'Resuming…',
      successToast: 'Work resumed',
    });
  }

  async function onFinishWork() {
    if (!timerForThisVisit) return;
    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    fd.set('entry_id', timerForThisVisit.id);
    if (busy) return;
    setBusy('timer');
    setTimerPendingLabel('Finishing…');
    const started = performance.now();
    try {
      await finishWorkAction(fd);
      setLastTimerMs(Math.round(performance.now() - started));
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      showToast('error', 'Unable to finish work timer.');
      setBusy(null);
      setTimerPendingLabel(null);
    }
  }

  async function onSaveReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setReportPending(true);
    setBusy('report');
    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    fd.set('field_status', formDefault);
    fd.set('completion_note', completion);
    fd.set('outstanding_work', outstanding);
    fd.set('issues', issuesText);
    if (followUp) fd.set('follow_up_required', 'yes');
    fd.set('expected_field_status', expectedStatus);
    fd.set('expected_completion_note', expectedCompletion);
    fd.set('expected_outstanding_work', expectedOutstanding);
    fd.set('expected_issues', expectedIssues);
    if (expectedFollowUp) fd.set('expected_follow_up_required', 'yes');
    if (expectedTechUpdatedAt) fd.set('expected_tech_report_updated_at', expectedTechUpdatedAt);

    try {
      const result = await updateVisitProgressAction(fd);
      if (!result.ok) {
        showToast('error', result.error);
        return;
      }
      reportDirty.current = false;
      if (result.techReportUpdatedAt) {
        setExpectedTechUpdatedAt(result.techReportUpdatedAt);
      }
      if (canFinalise && !sharedFinalised) {
        setExpectedStatus(formDefault);
        setExpectedCompletion(completion.trim());
        setExpectedOutstanding(outstanding.trim());
        setExpectedIssues(issuesText.trim());
        setExpectedFollowUp(followUp);
      }
      setReportSavedFlash(true);
      showToast(
        'success',
        result.noop ? 'Work report already up to date' : result.message || 'Work report saved',
      );
      refreshSoft();
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      showToast('error', 'Unable to save work report.');
    } finally {
      setReportPending(false);
      setBusy(null);
    }
  }

  async function onAddNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !noteBody.trim()) return;
    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    fd.set('body', noteBody);
    const ok = await runAction('note', addTechnicianNoteAction, fd, {
      successToast: 'Note saved',
      onSuccess: () => {
        noteDirty.current = false;
        setNoteBody('');
      },
    });
    if (!ok) {
      /* preserve noteBody */
    }
  }

  async function onManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set('appointment_id', appointmentId);
    const ok = await runAction('manual', addManualTimeEntryAction, fd, {
      successToast: 'Manual time entry saved',
    });
    if (ok) form.reset();
  }

  async function onUploadPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy('photo');
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set('appointment_id', appointmentId);
    try {
      await uploadJobPhotoAction(fd);
      showToast('success', 'Photo uploaded');
      form.reset();
      refreshSoft();
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      const message =
        error instanceof Error && error.message ? error.message : 'Unable to upload photo.';
      showToast('error', message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ee-tech-stack">
      <HqToast toast={toast} onDismiss={() => setToast(null)} />

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
                ? ` · Break ${formatDurationMinutes(timerForThisVisit.liveBreakMinutes)} · ${statusLabel(timerForThisVisit.status)}`
                : ' · No active timer on this visit'}
            </span>
            <span>Scheduled duration {formatDurationMinutes(scheduledMinutes)} (unchanged by timer)</span>
            {lastTimerMs != null ? (
              <span className="ee-tech-muted">Last timer action · {lastTimerMs} ms</span>
            ) : null}
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
            <div className="ee-tech-actions">
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-primary"
                disabled={timerLocked}
                onClick={onStartWork}
              >
                {timerPendingLabel === 'Starting…' ? 'Starting…' : 'Start work'}
              </button>
            </div>
          ) : timerForThisVisit.status === 'active' ? (
            <div className="ee-tech-actions">
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-secondary"
                disabled={timerLocked}
                onClick={onPauseWork}
              >
                {timerPendingLabel === 'Starting break…' ? 'Starting break…' : 'Start break'}
              </button>
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-primary"
                disabled={timerLocked}
                onClick={onFinishWork}
              >
                {timerPendingLabel === 'Finishing…' ? 'Finishing…' : 'Finish work'}
              </button>
            </div>
          ) : (
            <div className="ee-tech-actions">
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-primary"
                disabled={timerLocked}
                onClick={onResumeWork}
              >
                {timerPendingLabel === 'Resuming…' ? 'Resuming…' : 'Resume work'}
              </button>
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-secondary"
                disabled={timerLocked}
                onClick={onFinishWork}
              >
                {timerPendingLabel === 'Finishing…' ? 'Finishing…' : 'Finish work'}
              </button>
            </div>
          )}

          <details>
            <summary>Add manual time entry</summary>
            <form onSubmit={onManualEntry} className="ee-tech-form" style={{ marginTop: 12 }}>
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
              <button
                type="submit"
                className="ee-tech-btn ee-tech-btn-secondary"
                disabled={busy !== null}
              >
                {busy === 'manual' ? 'Saving…' : 'Save manual entry'}
              </button>
            </form>
          </details>
        </div>

        {entries.length ? (
          <div style={{ marginTop: 14 }}>
            <h3
              style={{
                margin: '0 0 6px',
                fontSize: 12,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: '#5f7a8f',
              }}
            >
              Recorded time
            </h3>
            {entries.map((e) => (
              <div className="ee-tech-time-row" key={e.id}>
                <strong>
                  {e.staffName} · {formatDurationMinutes(e.workedMinutes ?? e.liveWorkedMinutes)} worked
                </strong>
                <span className={`ee-tech-entry-status ${statusClass(e.status)}`}>
                  {statusLabel(e.status)}
                </span>
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
                  {formatDurationMinutes(
                    e.status === 'active' || e.status === 'on_break'
                      ? e.liveBreakMinutes
                      : e.breakMinutes,
                  )}
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
        <h2>My Work Report</h2>
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
            <dt>Shared visit outcome</dt>
            <dd>{FIELD_STATUS_LABELS[fieldStatus]}</dd>
          </div>
        </dl>
        <p className="ee-tech-muted" style={{ marginTop: 0 }}>
          This is your personal work report. Completing it does not close the overall job.
          {!hasPersonalReport
            ? ' Fields may be pre-filled from an earlier shared summary — editing saves as your report only.'
            : null}
        </p>
        {!canFinalise ? (
          <p className="ee-tech-muted" role="status" style={{ marginTop: 0 }}>
            Shared visit · office sets the final outcome. Record your own work here.
          </p>
        ) : null}
        {sharedFinalised ? (
          <p className="ee-tech-muted" role="status" style={{ marginTop: 0 }}>
            Shared visit outcome is finalised. You can still update your personal work report.
          </p>
        ) : null}
        <form onSubmit={onSaveReport} className="ee-tech-form">
          <fieldset className="ee-tech-outcome">
            <legend>{canFinalise && !sharedFinalised ? 'Visit outcome' : 'My progress'}</legend>
            {selectableOutcomes.map((key) => (
              <label key={key} className="ee-tech-outcome-option">
                <input
                  type="radio"
                  name="field_status"
                  value={key}
                  checked={formDefault === key}
                  required
                  onChange={() => {
                    markReportDirty();
                    setOutcome(key);
                  }}
                />
                <span>
                  <strong>{VISIT_OUTCOME_LABELS[key]}</strong>
                  <small>
                    {canFinalise && !sharedFinalised
                      ? VISIT_OUTCOME_HINTS[key]
                      : key === 'work_completed'
                        ? 'Marks your own work as finished (does not close a shared visit).'
                        : VISIT_OUTCOME_HINTS[key]}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          <label>
            Work completed / summary
            <textarea
              name="completion_note"
              maxLength={2000}
              value={completion}
              onChange={(e) => {
                markReportDirty();
                setCompletion(e.target.value);
              }}
            />
          </label>
          <label>
            Outstanding work
            <textarea
              name="outstanding_work"
              maxLength={2000}
              value={outstanding}
              onChange={(e) => {
                markReportDirty();
                setOutstanding(e.target.value);
              }}
            />
          </label>
          <label>
            Issues encountered
            <textarea
              name="issues"
              maxLength={2000}
              value={issuesText}
              onChange={(e) => {
                markReportDirty();
                setIssuesText(e.target.value);
              }}
            />
          </label>
          <label className="ee-tech-check">
            <input
              type="checkbox"
              name="follow_up_required"
              value="yes"
              checked={followUp}
              onChange={(e) => {
                markReportDirty();
                setFollowUp(e.target.checked);
              }}
            />
            Further visit required
          </label>
          <button
            type="submit"
            className="ee-tech-btn ee-tech-btn-primary"
            disabled={busy !== null}
          >
            {reportPending ? 'Saving…' : reportSavedFlash ? 'Saved' : 'Save my work report'}
          </button>
        </form>
      </section>

      <section className="ee-tech-panel">
        <h2>Work notes</h2>
        <form onSubmit={onAddNote} className="ee-tech-form">
          <label>
            Add note
            <textarea
              name="body"
              required
              maxLength={4000}
              placeholder="What did you find on site?"
              value={noteBody}
              onChange={(e) => {
                noteDirty.current = true;
                setNoteBody(e.target.value);
              }}
            />
          </label>
          <button
            type="submit"
            className="ee-tech-btn ee-tech-btn-secondary"
            disabled={busy !== null || !noteBody.trim()}
          >
            {busy === 'note' ? 'Saving…' : 'Add note'}
          </button>
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
        <form onSubmit={onUploadPhoto} className="ee-tech-form" encType="multipart/form-data">
          <label>
            Upload from camera or library
            <input type="file" name="photo" accept="image/*" capture="environment" required />
          </label>
          <label>
            Caption (optional)
            <input name="caption" maxLength={500} />
          </label>
          <button
            type="submit"
            className="ee-tech-btn ee-tech-btn-secondary"
            disabled={busy !== null}
          >
            {busy === 'photo' ? 'Uploading…' : 'Upload photo'}
          </button>
        </form>
        {photos.length ? (
          <div className="ee-tech-gallery" style={{ marginTop: 12 }}>
            {photos.map((p) =>
              p.signedUrl ? (
                <a
                  key={p.id}
                  href={p.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={p.caption ?? 'Job photo'}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.signedUrl} alt={p.caption || 'Job photo'} />
                </a>
              ) : (
                <figure key={p.id}>
                  <span
                    className="ee-tech-muted"
                    style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 12 }}
                  >
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

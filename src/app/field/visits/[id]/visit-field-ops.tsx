'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import HqToast, { type HqToastMessage } from '@/app/hq/hq-toast';
import {
  addFieldSiteUpdateAction,
  addManualTimeEntryAction,
  finishWorkAction,
  pauseWorkAction,
  resumeWorkAction,
  startWorkAction,
  updateVisitProgressAction,
  type TechFieldActionResult,
} from '../../actions';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import {
  displayLiveBreakMinutes,
  displayLiveWorkedMinutes,
  formatDurationMinutes,
} from '@/lib/tech-time-format';
import {
  VISIT_OUTCOME_LABELS,
  VISIT_OUTCOME_STATUSES,
  canTechnicianFinaliseSharedVisit,
  isTerminalVisitOutcome,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';
import {
  TIMER_ACTION_LABELS,
  TIMER_PENDING_LABELS,
  isPrimaryTimerAction,
  resolveTimerUiPhase,
  timerBreakCaption,
  timerPhaseStatusLabel,
  timerPrimaryActions,
  timerWorkCaption,
  type TimerPrimaryAction,
  type TimerUiPhase,
} from '@/lib/tech-visit-ui';
import {
  buildVisitReportFormStateForAppointment,
  shouldResetVisitReportForm,
} from '@/lib/tech-visit-form-state';
import { buildJobUpdateCards } from '@/lib/job-updates';
import { enqueueOutboxItem } from '@/lib/field-offline/db';
import { createOutboxItem, formDataToPayload } from '@/lib/field-offline/outbox';
import type { FieldOutboxActionType } from '@/lib/field-offline/types';
import { notifyFieldOutboxChanged } from '../../field-offline-chrome';

/** Soft poll while live timers exist — keeps multi-tech status fresh without Realtime. */
const LIVE_TIMER_POLL_MS = 20_000;
/** Client display tick — recomputes elapsed minutes without changing stored values. */
const DISPLAY_TICK_MS = 1_000;

type TimeEntryView = {
  id: string;
  staffName: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  breakStartedAt: string | null;
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
  contentType: string;
  jobNoteId: string | null;
};

type Props = {
  staffId: string;
  appointmentId: string;
  appointmentDateLabel: string;
  visitDayKey: string;
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
  visitNotes: string | null;
  jobDescription: string | null;
  electricianNames: string[];
};

type BusyKind = 'timer' | 'report' | 'update' | 'manual' | null;
type FoldSection = 'update' | 'report';

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

function phaseFromOptimistic(
  action: TimerPrimaryAction | null,
  base: TimerUiPhase,
): TimerUiPhase {
  if (!action) return base;
  if (action === 'start' || action === 'resume') return 'working';
  if (action === 'take_break') return 'on_break';
  if (action === 'finish') return 'finished';
  return base;
}

export default function VisitFieldOps({
  staffId,
  appointmentId,
  visitDayKey,
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
  visitNotes,
  jobDescription,
  electricianNames,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [toast, setToast] = useState<HqToastMessage | null>(null);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [timerPendingAction, setTimerPendingAction] = useState<TimerPrimaryAction | null>(null);
  const [optimisticPhase, setOptimisticPhase] = useState<TimerUiPhase | null>(null);
  const [localFinished, setLocalFinished] = useState(timeRecorded);
  const [reportPending, setReportPending] = useState(false);
  const [reportSavedFlash, setReportSavedFlash] = useState(false);
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [updateOpen, setUpdateOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [updateNote, setUpdateNote] = useState('');
  const [manualDay, setManualDay] = useState(visitDayKey);
  const [manualStart, setManualStart] = useState('07:00');
  const [manualEnd, setManualEnd] = useState('15:00');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const reportDirty = useRef(false);
  const formAppointmentIdRef = useRef(appointmentId);

  const [expectedStatus, setExpectedStatus] = useState(fieldStatus);
  const [expectedCompletion, setExpectedCompletion] = useState(sharedCompletionNote ?? '');
  const [expectedOutstanding, setExpectedOutstanding] = useState(sharedOutstandingWork ?? '');
  const [expectedIssues, setExpectedIssues] = useState(sharedIssues ?? '');
  const [expectedFollowUp, setExpectedFollowUp] = useState(sharedFollowUpRequired);
  const [expectedTechUpdatedAt, setExpectedTechUpdatedAt] = useState(techReportUpdatedAt);

  const [outcome, setOutcome] = useState<VisitOutcomeStatus>(personalProgressStatus);
  const [completion, setCompletion] = useState(completionNote ?? '');
  const [followUp, setFollowUp] = useState(followUpRequired);

  const dismissToast = useCallback(() => setToast(null), []);
  const showToast = useCallback((tone: HqToastMessage['tone'], text: string) => {
    setToast({ id: Date.now(), tone, text });
  }, []);

  useEffect(() => {
    setLocalFinished(timeRecorded);
  }, [timeRecorded, appointmentId]);

  useEffect(() => {
    setManualDay(visitDayKey);
  }, [visitDayKey]);

  useEffect(() => {
    if (!shouldResetVisitReportForm(formAppointmentIdRef.current, appointmentId)) {
      formAppointmentIdRef.current = appointmentId;
      return;
    }
    const next = buildVisitReportFormStateForAppointment({
      appointmentId,
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
    });
    formAppointmentIdRef.current = appointmentId;
    reportDirty.current = next.reportDirty;
    setBusy(next.busy);
    setReportPending(next.reportPending);
    setReportSavedFlash(next.reportSavedFlash);
    setExpectedStatus(next.expectedStatus);
    setExpectedCompletion(next.expectedCompletion);
    setExpectedOutstanding(next.expectedOutstanding);
    setExpectedIssues(next.expectedIssues);
    setExpectedFollowUp(next.expectedFollowUp);
    setExpectedTechUpdatedAt(next.expectedTechUpdatedAt);
    setOutcome(next.outcome);
    setCompletion(next.completion);
    setFollowUp(next.followUp);
    setUpdateNote('');
    setPhotoFile(null);
    setOptimisticPhase(null);
    setToast(null);
  }, [
    appointmentId,
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

  useEffect(() => {
    if (formAppointmentIdRef.current !== appointmentId) return;
    if (reportDirty.current) return;
    setExpectedStatus(fieldStatus);
    setExpectedCompletion(sharedCompletionNote ?? '');
    setExpectedOutstanding(sharedOutstandingWork ?? '');
    setExpectedIssues(sharedIssues ?? '');
    setExpectedFollowUp(sharedFollowUpRequired);
    setExpectedTechUpdatedAt(techReportUpdatedAt);
    setOutcome(personalProgressStatus);
    setCompletion(completionNote ?? '');
    setFollowUp(followUpRequired);
  }, [
    appointmentId,
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
      if (document.visibilityState === 'visible' && busy !== 'timer') refreshSoft();
    }, LIVE_TIMER_POLL_MS);
    return () => window.clearInterval(id);
  }, [activeEntry, entries, busy, refreshSoft]);

  useEffect(() => {
    if (!activeEntry || (activeEntry.status !== 'active' && activeEntry.status !== 'on_break')) {
      return;
    }
    setNowIso(new Date().toISOString());
    const id = window.setInterval(() => setNowIso(new Date().toISOString()), DISPLAY_TICK_MS);
    return () => window.clearInterval(id);
  }, [activeEntry]);

  // Clear optimistic phase once server props catch up.
  useEffect(() => {
    if (!optimisticPhase) return;
    const serverPhase = resolveTimerUiPhase({
      activeStatus: activeEntry?.status ?? null,
      timeRecorded: localFinished,
    });
    if (serverPhase === optimisticPhase) setOptimisticPhase(null);
  }, [activeEntry, localFinished, optimisticPhase]);

  const markReportDirty = () => {
    reportDirty.current = true;
    setReportSavedFlash(false);
  };

  function openSection(section: FoldSection) {
    if (section === 'update') setUpdateOpen(true);
    if (section === 'report') setReportOpen(true);
    const id = section === 'update' ? 'site-update' : 'visit-report';
    window.requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const focusable = el.querySelector<HTMLElement>(
        'textarea, button:not([disabled]), input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"])',
      );
      focusable?.focus({ preventScroll: true });
    });
  }

  async function queueOffline(
    action: FieldOutboxActionType,
    formData: FormData,
    successToast: string,
  ): Promise<boolean> {
    try {
      await enqueueOutboxItem(
        createOutboxItem({
          staffId,
          appointmentId,
          action,
          payload: formDataToPayload(formData),
        }),
      );
      notifyFieldOutboxChanged();
      showToast('success', `${successToast} · saved offline`);
      return true;
    } catch {
      showToast('error', 'Unable to save offline. Try again when you have signal.');
      return false;
    }
  }

  async function runAction(
    kind: BusyKind,
    action: (fd: FormData) => Promise<TechFieldActionResult>,
    formData: FormData,
    opts?: {
      pendingAction?: TimerPrimaryAction;
      successToast?: string;
      onSuccess?: () => void;
      offlineAction?: FieldOutboxActionType;
      rollbackOptimistic?: () => void;
    },
  ): Promise<boolean> {
    if (busy && kind !== 'timer') return false;
    if (kind === 'timer' && busy === 'timer') return false;
    setBusy(kind);
    if (opts?.pendingAction) setTimerPendingAction(opts.pendingAction);
    try {
      if (!navigator.onLine && opts?.offlineAction) {
        const ok = await queueOffline(opts.offlineAction, formData, opts.successToast || 'Saved');
        if (ok) opts?.onSuccess?.();
        else opts?.rollbackOptimistic?.();
        return ok;
      }
      const result = await action(formData);
      if (!result.ok) {
        opts?.rollbackOptimistic?.();
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
      if (!navigator.onLine && opts?.offlineAction) {
        const ok = await queueOffline(opts.offlineAction, formData, opts.successToast || 'Saved');
        if (ok) opts?.onSuccess?.();
        else opts?.rollbackOptimistic?.();
        return ok;
      }
      opts?.rollbackOptimistic?.();
      showToast('error', 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(null);
      setTimerPendingAction(null);
    }
  }

  const timerForThisVisit = activeEntry && activeEntry.id ? activeEntry : null;
  const serverPhase = resolveTimerUiPhase({
    activeStatus: timerForThisVisit?.status ?? null,
    timeRecorded: localFinished,
  });
  const timerPhase = optimisticPhase ?? serverPhase;
  const phaseActions = timerPrimaryActions(timerPhase);
  const canFinalise = canTechnicianFinaliseSharedVisit(assignedTechnicianCount);
  const sharedFinalised = isTerminalVisitOutcome(fieldStatus);
  const selectableOutcomes: VisitOutcomeStatus[] = [...VISIT_OUTCOME_STATUSES];
  const formDefault = selectableOutcomes.includes(outcome) ? outcome : 'in_progress';
  const timerLocked = busy === 'timer';

  const workedMinutes = timerForThisVisit
    ? displayLiveWorkedMinutes(timerForThisVisit, nowIso)
    : 0;
  const breakMinutes = timerForThisVisit
    ? displayLiveBreakMinutes(timerForThisVisit, nowIso)
    : 0;
  const workedDisplay = formatDurationMinutes(workedMinutes);
  const breakDisplay = formatDurationMinutes(breakMinutes);

  const updateCards = useMemo(
    () =>
      buildJobUpdateCards(
        notes.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.authorName,
          visibility: 'shared',
          createdAt: n.createdAt,
        })),
        photos.map((p) => ({
          id: p.id,
          signedUrl: p.signedUrl,
          caption: p.caption,
          uploadedByName: null,
          contentType: p.contentType || 'image/jpeg',
          createdAt: p.createdAt,
          jobNoteId: p.jobNoteId,
        })),
      ),
    [notes, photos],
  );

  async function onTimerAction(action: TimerPrimaryAction) {
    const previousPhase = timerPhase;
    setOptimisticPhase(phaseFromOptimistic(action, previousPhase));

    if (action === 'start') {
      const fd = new FormData();
      fd.set('appointment_id', appointmentId);
      await runAction('timer', startWorkAction, fd, {
        pendingAction: 'start',
        successToast: 'Work started',
        offlineAction: 'start_work',
        rollbackOptimistic: () => setOptimisticPhase(null),
      });
      return;
    }

    if (!timerForThisVisit && action !== 'finish') {
      setOptimisticPhase(null);
      return;
    }

    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    if (timerForThisVisit) fd.set('entry_id', timerForThisVisit.id);

    if (action === 'take_break') {
      await runAction('timer', pauseWorkAction, fd, {
        pendingAction: 'take_break',
        successToast: 'Break started',
        offlineAction: 'pause_work',
        rollbackOptimistic: () => setOptimisticPhase(previousPhase),
      });
      return;
    }

    if (action === 'resume') {
      await runAction('timer', resumeWorkAction, fd, {
        pendingAction: 'resume',
        successToast: 'Work resumed',
        offlineAction: 'resume_work',
        rollbackOptimistic: () => setOptimisticPhase(previousPhase),
      });
      return;
    }

    if (action === 'finish') {
      if (!timerForThisVisit) {
        setOptimisticPhase(null);
        return;
      }
      setBusy('timer');
      setTimerPendingAction('finish');
      setLocalFinished(true);
      try {
        if (!navigator.onLine) {
          await queueOffline('finish_work', fd, 'Work finished');
          openSection('report');
          return;
        }
        const result = await finishWorkAction(fd);
        if (!result.ok) {
          setLocalFinished(false);
          setOptimisticPhase(previousPhase);
          showToast('error', result.error);
          return;
        }
        showToast('success', result.message || 'Work finished');
        openSection('report');
        refreshSoft();
      } catch (error) {
        if (isNextRedirectError(error)) throw error;
        if (!navigator.onLine) {
          await queueOffline('finish_work', fd, 'Work finished');
          openSection('report');
          return;
        }
        setLocalFinished(false);
        setOptimisticPhase(previousPhase);
        showToast('error', 'Unable to finish work timer.');
      } finally {
        setBusy(null);
        setTimerPendingAction(null);
      }
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
    fd.set('outstanding_work', '');
    fd.set('issues', '');
    if (followUp) fd.set('follow_up_required', 'yes');
    fd.set('expected_field_status', expectedStatus);
    fd.set('expected_completion_note', expectedCompletion);
    fd.set('expected_outstanding_work', expectedOutstanding);
    fd.set('expected_issues', expectedIssues);
    if (expectedFollowUp) fd.set('expected_follow_up_required', 'yes');
    if (expectedTechUpdatedAt) fd.set('expected_tech_report_updated_at', expectedTechUpdatedAt);

    try {
      if (!navigator.onLine) {
        await queueOffline('update_progress', fd, 'Progress saved');
        reportDirty.current = false;
        setReportSavedFlash(true);
        return;
      }
      const result = await updateVisitProgressAction(fd);
      if (result.techReportUpdatedAt) {
        setExpectedTechUpdatedAt(result.techReportUpdatedAt);
      }
      if (!result.ok) {
        showToast('error', result.error);
        refreshSoft();
        return;
      }
      reportDirty.current = false;
      if (canFinalise && !sharedFinalised) {
        setExpectedStatus(formDefault);
        setExpectedCompletion(completion.trim());
        setExpectedOutstanding('');
        setExpectedIssues('');
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

  function onPickPhoto(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    setPhotoFile(file);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (libraryInputRef.current) libraryInputRef.current.value = '';
  }

  async function onSaveSiteUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!updateNote.trim() && !photoFile) {
      showToast('error', 'Add a note, a photo, or both.');
      return;
    }
    if (photoFile && !navigator.onLine) {
      showToast('error', 'Photos need a signal. Upload when you’re back online.');
      return;
    }

    const fd = new FormData();
    fd.set('appointment_id', appointmentId);
    if (updateNote.trim()) fd.set('body', updateNote.trim());
    if (photoFile) fd.set('photos', photoFile);

    // Offline: notes only (photos stay online-only).
    if (!navigator.onLine && updateNote.trim() && !photoFile) {
      setBusy('update');
      try {
        const queued = await queueOffline('add_note', fd, 'Note saved');
        if (queued) setUpdateNote('');
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy('update');
    try {
      const result = await addFieldSiteUpdateAction(fd);
      if (!result.ok) {
        showToast('error', result.error);
        return;
      }
      showToast('success', result.message || 'Update saved');
      setUpdateNote('');
      setPhotoFile(null);
      refreshSoft();
    } catch (error) {
      if (isNextRedirectError(error)) throw error;
      showToast('error', 'Unable to save update.');
    } finally {
      setBusy(null);
    }
  }

  async function onManualEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manualDay)) {
      showToast('error', 'Enter a valid date.');
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(manualStart) || !/^\d{2}:\d{2}$/.test(manualEnd)) {
      showToast('error', 'Enter valid start and end times.');
      return;
    }
    if (manualEnd <= manualStart) {
      showToast('error', 'End time must be after start time on the same day.');
      return;
    }
    const form = event.currentTarget;
    const fd = new FormData(form);
    fd.set('appointment_id', appointmentId);
    fd.set('started_at', `${manualDay}T${manualStart}`);
    fd.set('ended_at', `${manualDay}T${manualEnd}`);
    const ok = await runAction('manual', addManualTimeEntryAction, fd, {
      successToast: 'Manual time entry saved',
    });
    if (ok) {
      form.reset();
      setManualDay(visitDayKey);
      setManualStart('07:00');
      setManualEnd('15:00');
    }
  }

  const updateAssetCount = updateCards.length;

  return (
    <div className="ee-tech-stack">
      <HqToast toast={toast} onDismiss={dismissToast} />

      <section
        className={`ee-tech-timer-hero ee-tech-timer-hero-${timerPhase}`}
        aria-labelledby="work-timer-heading"
      >
        <div className="ee-tech-timer-hero-head">
          <h2 id="work-timer-heading">Work timer</h2>
          <span className={`ee-tech-timer-phase ee-tech-timer-phase-${timerPhase}`}>
            {timerPhaseStatusLabel(timerPhase)}
          </span>
        </div>

        <div className="ee-tech-timer-readout ee-tech-timer-readout-hero">
          <div className="ee-tech-timer-primary">
            <span className="ee-tech-timer-caption">{timerWorkCaption(timerPhase)}</span>
            <strong aria-live="polite">{workedDisplay}</strong>
          </div>
          <div className="ee-tech-timer-metrics">
            <div
              className={
                timerPhase === 'on_break' ? 'ee-tech-timer-metric is-live' : 'ee-tech-timer-metric'
              }
            >
              <span>{timerBreakCaption(timerPhase)}</span>
              <strong aria-live="polite">{breakDisplay}</strong>
            </div>
            <div className="ee-tech-timer-metric">
              <span>Scheduled</span>
              <strong>{formatDurationMinutes(scheduledMinutes)}</strong>
            </div>
          </div>
          <span className="ee-tech-timer-schedule">Appointment {scheduledLabel}</span>
        </div>

        {timerPhase === 'finished' ? (
          <div className="ee-tech-alert ee-tech-alert-success" role="status">
            <p style={{ margin: 0 }}>
              Time recorded. Complete your work report when you&apos;re ready.
            </p>
            <button
              type="button"
              className="ee-tech-btn ee-tech-btn-secondary"
              style={{ marginTop: 8 }}
              onClick={() => openSection('report')}
            >
              Go to My Work Report
            </button>
          </div>
        ) : (
          <div className="ee-tech-actions ee-tech-actions-timer">
            {phaseActions.map((action) => {
              const primary = isPrimaryTimerAction(timerPhase, action);
              const pending = timerPendingAction === action;
              return (
                <button
                  key={action}
                  type="button"
                  className={
                    primary ? 'ee-tech-btn ee-tech-btn-primary' : 'ee-tech-btn ee-tech-btn-secondary'
                  }
                  disabled={timerLocked}
                  onClick={() => void onTimerAction(action)}
                >
                  {pending ? TIMER_PENDING_LABELS[action] : TIMER_ACTION_LABELS[action]}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <nav className="ee-tech-quick ee-tech-quick-2" aria-label="Quick actions">
        <button type="button" className="ee-tech-quick-btn" onClick={() => openSection('update')}>
          Site update
          {updateAssetCount ? (
            <span className="ee-tech-quick-count">{updateAssetCount}</span>
          ) : null}
        </button>
        <button type="button" className="ee-tech-quick-btn" onClick={() => openSection('report')}>
          Work report
        </button>
      </nav>

      <details className="ee-tech-fold">
        <summary>Visit details</summary>
        <div className="ee-tech-fold-body">
          <dl className="ee-tech-dl ee-tech-dl-compact">
            <div>
              <dt>Current outcome</dt>
              <dd>{FIELD_STATUS_LABELS[fieldStatus]}</dd>
            </div>
            <div>
              <dt>Instructions</dt>
              <dd>{visitNotes || 'No appointment instructions.'}</dd>
            </div>
            <div>
              <dt>Work description</dt>
              <dd>{jobDescription || 'No work description added yet.'}</dd>
            </div>
            {electricianNames.length ? (
              <div>
                <dt>Assigned electricians</dt>
                <dd>{electricianNames.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </details>

      <details
        className="ee-tech-fold"
        id="site-update"
        open={updateOpen}
        onToggle={(e) => setUpdateOpen(e.currentTarget.open)}
      >
        <summary>
          Site update{updateAssetCount ? ` · ${updateAssetCount}` : ''}
        </summary>
        <div className="ee-tech-fold-body">
          <form onSubmit={onSaveSiteUpdate} className="ee-tech-form">
            <label>
              Note (optional)
              <textarea
                name="body"
                maxLength={4000}
                placeholder="What did you find on site?"
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
              />
            </label>
            <input
              ref={cameraInputRef}
              className="ee-tech-file-hidden"
              type="file"
              accept="image/*"
              capture="environment"
              tabIndex={-1}
              onChange={(e) => onPickPhoto(e.target.files)}
            />
            <input
              ref={libraryInputRef}
              className="ee-tech-file-hidden"
              type="file"
              accept="image/*"
              tabIndex={-1}
              onChange={(e) => onPickPhoto(e.target.files)}
            />
            <div className="ee-tech-photo-actions">
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-secondary"
                onClick={() => cameraInputRef.current?.click()}
              >
                Take photo
              </button>
              <button
                type="button"
                className="ee-tech-btn ee-tech-btn-secondary"
                onClick={() => libraryInputRef.current?.click()}
              >
                From library
              </button>
            </div>
            {photoFile ? (
              <p className="ee-tech-photo-chosen" role="status">
                Selected · {photoFile.name}
              </p>
            ) : (
              <p className="ee-tech-muted" style={{ margin: 0 }}>
                Add a note, a photo, or both — then save once.
              </p>
            )}
            <button
              type="submit"
              className="ee-tech-btn ee-tech-btn-primary"
              disabled={busy === 'update' || (!updateNote.trim() && !photoFile)}
            >
              {busy === 'update' ? 'Saving…' : 'Save update'}
            </button>
          </form>

          {updateCards.length ? (
            <div className="ee-tech-site-feed" style={{ marginTop: 14 }}>
              {updateCards.map((card) => (
                <article key={card.id} className="ee-tech-site-card">
                  {card.kind === 'note' ? (
                    <>
                      <p>{card.note.body}</p>
                      {card.photos.length ? (
                        <div className="ee-tech-gallery">
                          {card.photos.map((p) =>
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
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      <small>
                        {card.note.authorName ?? 'Technician'} ·{' '}
                        {new Date(card.createdAt).toLocaleString('en-AU', {
                          timeZone: 'Australia/Perth',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </small>
                    </>
                  ) : (
                    <>
                      <div className="ee-tech-gallery">
                        {card.photos.map((p) =>
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
                          ) : null,
                        )}
                      </div>
                      <small>
                        {new Date(card.createdAt).toLocaleString('en-AU', {
                          timeZone: 'Australia/Perth',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </small>
                    </>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="ee-tech-muted">No site updates for this visit yet.</p>
          )}
        </div>
      </details>

      <details
        className="ee-tech-fold"
        id="visit-report"
        open={reportOpen}
        onToggle={(e) => setReportOpen(e.currentTarget.open)}
      >
        <summary>My Work Report</summary>
        <div className="ee-tech-fold-body">
          {!canFinalise ? (
            <p className="ee-tech-hint" role="status">
              Shared visit · closes when every assigned electrician submits a final report.
            </p>
          ) : null}
          {sharedFinalised ? (
            <p className="ee-tech-hint" role="status">
              Visit completed — crew outcome recorded. You can still update your personal work
              report.
            </p>
          ) : null}
          <form onSubmit={onSaveReport} className="ee-tech-form">
            <fieldset className="ee-tech-outcome">
              <legend>{canFinalise && !sharedFinalised ? 'Visit outcome' : 'My progress'}</legend>
              {selectableOutcomes.map((key) => (
                <label key={key} className="ee-tech-outcome-option ee-tech-outcome-compact">
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
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              Summary
              <textarea
                name="completion_note"
                maxLength={2000}
                placeholder="What was done, what’s left, any issues…"
                value={completion}
                onChange={(e) => {
                  markReportDirty();
                  setCompletion(e.target.value);
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
            <p className="ee-tech-hint" style={{ marginTop: -4 }}>
              Flags office to schedule or link a follow-up — does not create an appointment.
            </p>
            <button
              type="submit"
              className="ee-tech-btn ee-tech-btn-primary"
              disabled={busy === 'report'}
            >
              {reportPending ? 'Saving…' : reportSavedFlash ? 'Saved' : 'Save my work report'}
            </button>
          </form>
        </div>
      </details>

      <details className="ee-tech-fold">
        <summary>Time history &amp; manual entry</summary>
        <div className="ee-tech-fold-body">
          <p className="ee-tech-muted" style={{ marginTop: 0 }}>
            Scheduled duration {formatDurationMinutes(scheduledMinutes)} is unchanged by the timer.
          </p>

          <form onSubmit={onManualEntry} className="ee-tech-form">
            <label>
              Date (Perth)
              <input
                type="date"
                required
                value={manualDay}
                onChange={(e) => setManualDay(e.target.value)}
              />
            </label>
            <div className="ee-tech-manual-times">
              <label>
                Start time
                <input
                  type="time"
                  required
                  step={60}
                  value={manualStart}
                  onChange={(e) => setManualStart(e.target.value)}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  required
                  step={60}
                  value={manualEnd}
                  onChange={(e) => setManualEnd(e.target.value)}
                />
              </label>
            </div>
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
              disabled={busy === 'manual'}
            >
              {busy === 'manual' ? 'Saving…' : 'Save manual entry'}
            </button>
          </form>

          {entries.length ? (
            <div style={{ marginTop: 14 }}>
              <h3 className="ee-tech-subhead">Recorded time</h3>
              {entries.map((e) => (
                <div className="ee-tech-time-row" key={e.id}>
                  <strong>
                    {e.staffName} ·{' '}
                    {formatDurationMinutes(
                      e.status === 'active' || e.status === 'on_break'
                        ? displayLiveWorkedMinutes(e, nowIso)
                        : (e.workedMinutes ?? e.liveWorkedMinutes),
                    )}{' '}
                    worked
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
                        ? displayLiveBreakMinutes(e, nowIso)
                        : e.breakMinutes,
                    )}
                    {' · '}
                    {e.entrySource}
                  </span>
                  {e.note ? <span>{e.note}</span> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="ee-tech-muted">No time entries recorded yet.</p>
          )}
        </div>
      </details>
    </div>
  );
}

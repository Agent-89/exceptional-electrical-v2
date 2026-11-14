import type { FieldStatus } from '@/lib/tech-field-constants';

/** Technician-facing visit outcomes (subset of field_status). */
export const VISIT_OUTCOME_STATUSES = [
  'in_progress',
  'work_completed',
  'unable_to_complete',
] as const;

export type VisitOutcomeStatus = (typeof VISIT_OUTCOME_STATUSES)[number];

export const VISIT_OUTCOME_LABELS: Record<VisitOutcomeStatus, string> = {
  in_progress: 'In progress',
  work_completed: 'Visit completed',
  unable_to_complete: 'Unable to complete',
};

export const VISIT_OUTCOME_HINTS: Record<VisitOutcomeStatus, string> = {
  in_progress: 'Work on this visit is ongoing.',
  work_completed: "This appointment's work is finished.",
  unable_to_complete: 'The visit could not be completed as planned.',
};

export function isVisitOutcomeStatus(value: string): value is VisitOutcomeStatus {
  return (VISIT_OUTCOME_STATUSES as readonly string[]).includes(value);
}

/** Form default when the visit is still scheduled/paused from timer sync. */
export function defaultVisitOutcomeForForm(current: FieldStatus): VisitOutcomeStatus {
  if (current === 'work_completed' || current === 'unable_to_complete' || current === 'in_progress') {
    return current;
  }
  return 'in_progress';
}

/**
 * Shared visit outcome is appointment-scoped. When multiple technicians are
 * assigned, only the office should finalise the shared visit closure.
 */
export function canTechnicianFinaliseSharedVisit(assignedTechnicianCount: number): boolean {
  return assignedTechnicianCount <= 1;
}

export function isTerminalVisitOutcome(status: string): boolean {
  return status === 'work_completed' || status === 'unable_to_complete';
}

/** Finishing a personal timer must never close the visit or the job. */
export function timerFinishCompletesVisit(): boolean {
  return false;
}

/** Visit outcome updates must never flip jobs.status. */
export function visitOutcomeUpdatesJobStatus(): boolean {
  return false;
}

export type VisitReportFields = {
  completionNote: string | null;
  outstandingWork: string | null;
  issues: string | null;
  furtherVisitRequired: boolean;
};

export type VisitReportPatch = VisitReportFields & {
  fieldStatus: FieldStatus;
  fieldCompletedAt: string | null | undefined;
  appointmentStatusCompleted: boolean;
};

/**
 * Resolve the shared field_status a technician is allowed to write.
 * Multi-tech crews may save in-progress reports but cannot finalise the visit.
 */
export function resolveTechnicianVisitOutcome(input: {
  requested: string;
  assignedTechnicianCount: number;
}): { ok: true; fieldStatus: VisitOutcomeStatus } | { ok: false; error: string } {
  if (!isVisitOutcomeStatus(input.requested)) {
    return { ok: false, error: 'Invalid visit outcome.' };
  }
  if (
    isTerminalVisitOutcome(input.requested) &&
    !canTechnicianFinaliseSharedVisit(input.assignedTechnicianCount)
  ) {
    return {
      ok: false,
      error:
        'This visit has multiple technicians. Save your notes as in progress — the office will close the shared visit outcome.',
    };
  }
  return { ok: true, fieldStatus: input.requested };
}

/** Build the appointment patch for a visit report save. Never includes jobs.status. */
export function buildVisitReportPatch(input: {
  fieldStatus: VisitOutcomeStatus;
  fields: VisitReportFields;
  currentAppointmentStatus: string;
  completedAtIso: string;
}): VisitReportPatch {
  const terminal = isTerminalVisitOutcome(input.fieldStatus);
  return {
    fieldStatus: input.fieldStatus,
    completionNote: input.fields.completionNote,
    outstandingWork: input.fields.outstandingWork,
    issues: input.fields.issues,
    furtherVisitRequired: input.fields.furtherVisitRequired,
    fieldCompletedAt: terminal ? input.completedAtIso : undefined,
    appointmentStatusCompleted:
      terminal &&
      input.fieldStatus === 'work_completed' &&
      input.currentAppointmentStatus === 'scheduled',
  };
}

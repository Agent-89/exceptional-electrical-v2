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

/** Snapshot used for optimistic concurrency on shared visit report rows. */
export type VisitReportSnapshot = VisitReportFields & {
  fieldStatus: string;
};

export const VISIT_REPORT_CONFLICT_MESSAGE =
  'This visit report was updated by someone else. Refresh the page and try again.';

export function normalizeVisitReportText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function visitReportSnapshotsMatch(
  expected: VisitReportSnapshot,
  current: VisitReportSnapshot,
): boolean {
  return (
    expected.fieldStatus === current.fieldStatus &&
    normalizeVisitReportText(expected.completionNote) ===
      normalizeVisitReportText(current.completionNote) &&
    normalizeVisitReportText(expected.outstandingWork) ===
      normalizeVisitReportText(current.outstandingWork) &&
    normalizeVisitReportText(expected.issues) === normalizeVisitReportText(current.issues) &&
    Boolean(expected.furtherVisitRequired) === Boolean(current.furtherVisitRequired)
  );
}

/** True when the proposed save matches what is already stored — skip write + audit. */
export function visitReportSaveIsNoop(
  current: VisitReportSnapshot,
  proposed: VisitReportSnapshot,
): boolean {
  return visitReportSnapshotsMatch(current, proposed);
}

export type VisitReportPatch = VisitReportFields & {
  fieldStatus: FieldStatus;
  fieldCompletedAt: string | null | undefined;
  appointmentStatusCompleted: boolean;
};

/**
 * Resolve the shared field_status a technician is allowed to write.
 * Multi-tech crews may save personal reports but cannot finalise the shared visit.
 * Terminal shared outcomes are office-owned and must not be overwritten.
 */
export function resolveTechnicianVisitOutcome(input: {
  requested: string;
  assignedTechnicianCount: number;
  currentSharedFieldStatus?: string;
}): { ok: true; fieldStatus: VisitOutcomeStatus } | { ok: false; error: string } {
  if (!isVisitOutcomeStatus(input.requested)) {
    return { ok: false, error: 'Invalid visit outcome.' };
  }
  if (
    input.currentSharedFieldStatus &&
    isTerminalVisitOutcome(input.currentSharedFieldStatus) &&
    isTerminalVisitOutcome(input.requested) &&
    !canTechnicianFinaliseSharedVisit(input.assignedTechnicianCount)
  ) {
    return {
      ok: false,
      error: 'This visit outcome was already finalised by the office.',
    };
  }
  if (
    isTerminalVisitOutcome(input.requested) &&
    !canTechnicianFinaliseSharedVisit(input.assignedTechnicianCount)
  ) {
    return {
      ok: false,
      error:
        'This visit has multiple technicians. Save your own work report — the office will close the shared visit outcome.',
    };
  }
  return { ok: true, fieldStatus: input.requested };
}

/** Personal work-report fields (per technician, not the shared visit outcome). */
export type TechWorkReportFields = {
  workSummary: string | null;
  outstandingWork: string | null;
  issues: string | null;
  followUpRequired: boolean;
  progressStatus: VisitOutcomeStatus;
};

export type TechWorkReportSnapshot = TechWorkReportFields & {
  updatedAt: string | null;
};

export const TECH_WORK_REPORT_CONFLICT_MESSAGE =
  'Your work report was updated elsewhere. Refresh the page and try again.';

export function techWorkReportSnapshotsMatch(
  expected: TechWorkReportSnapshot,
  current: TechWorkReportSnapshot,
): boolean {
  return (
    expected.progressStatus === current.progressStatus &&
    normalizeVisitReportText(expected.workSummary) ===
      normalizeVisitReportText(current.workSummary) &&
    normalizeVisitReportText(expected.outstandingWork) ===
      normalizeVisitReportText(current.outstandingWork) &&
    normalizeVisitReportText(expected.issues) === normalizeVisitReportText(current.issues) &&
    Boolean(expected.followUpRequired) === Boolean(current.followUpRequired) &&
    (expected.updatedAt ?? null) === (current.updatedAt ?? null)
  );
}

export function techWorkReportSaveIsNoop(
  current: TechWorkReportSnapshot,
  proposed: TechWorkReportSnapshot,
): boolean {
  return (
    current.progressStatus === proposed.progressStatus &&
    normalizeVisitReportText(current.workSummary) ===
      normalizeVisitReportText(proposed.workSummary) &&
    normalizeVisitReportText(current.outstandingWork) ===
      normalizeVisitReportText(proposed.outstandingWork) &&
    normalizeVisitReportText(current.issues) === normalizeVisitReportText(proposed.issues) &&
    Boolean(current.followUpRequired) === Boolean(proposed.followUpRequired)
  );
}

/**
 * Whether a technician save may also write shared job_appointments.field_*.
 * Never when the shared outcome is already terminal (office-owned).
 * Solo techs may finalise; multi-tech may only nudge non-terminal status to in_progress.
 */
export function canTechnicianWriteSharedVisitFields(input: {
  assignedTechnicianCount: number;
  currentSharedFieldStatus: string;
  requestedPersonalStatus: VisitOutcomeStatus;
}): { writeShared: boolean; finaliseShared: boolean; reason?: string } {
  if (isTerminalVisitOutcome(input.currentSharedFieldStatus)) {
    return {
      writeShared: false,
      finaliseShared: false,
      reason: 'Shared visit outcome is already finalised by the office.',
    };
  }
  const solo = canTechnicianFinaliseSharedVisit(input.assignedTechnicianCount);
  if (solo && isTerminalVisitOutcome(input.requestedPersonalStatus)) {
    return { writeShared: true, finaliseShared: true };
  }
  if (solo) {
    return { writeShared: true, finaliseShared: false };
  }
  // Multi-tech: personal report only. Shared status is driven by timers / office.
  return { writeShared: false, finaliseShared: false };
}

/**
 * Seed a technician's empty personal form from legacy shared field_* text.
 * Read-only compatibility — does not mutate the database until the tech saves.
 */
export function seedTechWorkReportFromShared(shared: {
  completionNote: string | null;
  outstandingWork: string | null;
  issues: string | null;
  followUpRequired: boolean;
  fieldStatus: string;
}): TechWorkReportFields {
  return {
    workSummary: normalizeVisitReportText(shared.completionNote),
    outstandingWork: normalizeVisitReportText(shared.outstandingWork),
    issues: normalizeVisitReportText(shared.issues),
    followUpRequired: Boolean(shared.followUpRequired),
    progressStatus: defaultVisitOutcomeForForm(
      (['scheduled', 'in_progress', 'paused', 'work_completed', 'unable_to_complete'].includes(
        shared.fieldStatus,
      )
        ? shared.fieldStatus
        : 'in_progress') as FieldStatus,
    ),
  };
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

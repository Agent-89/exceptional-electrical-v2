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
 * Solo technicians may finalise the shared visit immediately from their own report.
 * Multi-tech crews finalise only when every assigned technician has a terminal report.
 */
export function canTechnicianFinaliseSharedVisit(assignedTechnicianCount: number): boolean {
  return assignedTechnicianCount <= 1;
}

export function isTerminalVisitOutcome(status: string): boolean {
  return status === 'work_completed' || status === 'unable_to_complete';
}

/** One technician's report contribution used when rolling up the shared visit outcome. */
export type TechReportRollupInput = {
  staffId: string;
  technicianName: string | null;
  progressStatus: string;
  workSummary: string | null;
  outstandingWork: string | null;
  issues: string | null;
  followUpRequired: boolean;
};

/** True when every assigned electrician has a terminal personal report. */
export function allAssignedReportsTerminal(
  assignedStaffIds: string[],
  reports: { staffId: string; progressStatus: string }[],
): boolean {
  if (!assignedStaffIds.length) return false;
  const byStaff = new Map(reports.map((report) => [report.staffId, report.progressStatus]));
  return assignedStaffIds.every((staffId) => {
    const status = byStaff.get(staffId);
    return Boolean(status && isTerminalVisitOutcome(status));
  });
}

function joinRollupNotes(
  reports: TechReportRollupInput[],
  pick: (report: TechReportRollupInput) => string | null,
): string | null {
  const parts = reports
    .map((report) => {
      const text = normalizeVisitReportText(pick(report));
      if (!text) return null;
      const name = report.technicianName?.trim() || 'Technician';
      return `${name}: ${text}`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join('\n\n') : null;
}

/**
 * Roll shared visit outcome from terminal personal reports.
 * Unable wins over completed; further visit if any tech flagged it.
 */
export function rollupSharedVisitOutcome(reports: TechReportRollupInput[]): {
  fieldStatus: VisitOutcomeStatus;
  fields: VisitReportFields;
} {
  const unable = reports.some((report) => report.progressStatus === 'unable_to_complete');
  return {
    fieldStatus: unable ? 'unable_to_complete' : 'work_completed',
    fields: {
      completionNote: joinRollupNotes(reports, (report) => report.workSummary),
      outstandingWork: joinRollupNotes(reports, (report) => report.outstandingWork),
      issues: joinRollupNotes(reports, (report) => report.issues),
      furtherVisitRequired: reports.some((report) => report.followUpRequired),
    },
  };
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
 * Resolve a technician's personal visit outcome status.
 * Multi-tech crews may save terminal personal reports; shared closure waits until all crew reports are terminal.
 * Terminal shared outcomes must not be overwritten by a later personal save path that still writes shared fields.
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
    // Personal report may still be edited; callers that only write personal rows should not use this error.
    return {
      ok: false,
      error: 'This visit outcome was already finalised from the crew reports.',
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
 * Whether a technician save may also write shared job_appointments.field_* immediately.
 * Never when the shared outcome is already terminal.
 * Solo techs may finalise immediately; multi-tech shared finalise is handled by crew roll-up after personal save.
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
      reason: 'Shared visit outcome is already finalised.',
    };
  }
  const solo = canTechnicianFinaliseSharedVisit(input.assignedTechnicianCount);
  if (solo && isTerminalVisitOutcome(input.requestedPersonalStatus)) {
    return { writeShared: true, finaliseShared: true };
  }
  if (solo) {
    return { writeShared: true, finaliseShared: false };
  }
  // Multi-tech: personal report only here; shared roll-up runs separately when all crew reports are terminal.
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

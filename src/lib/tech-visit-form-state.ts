import type { FieldStatus } from '@/lib/tech-field-constants';
import type { VisitOutcomeStatus } from '@/lib/tech-visit-report';

/**
 * Personal work reports are unique per (appointment, technician).
 * Switching visits must never reuse another appointment's concurrency token.
 */
export function techWorkReportIdentityKey(
  appointmentId: string,
  technicianUserId: string,
): string {
  return `${appointmentId}::${technicianUserId}`;
}

export type VisitReportFormServerSnapshot = {
  appointmentId: string;
  fieldStatus: FieldStatus;
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
};

export type VisitReportFormClientState = {
  appointmentId: string;
  expectedStatus: FieldStatus;
  expectedCompletion: string;
  expectedOutstanding: string;
  expectedIssues: string;
  expectedFollowUp: boolean;
  /** Must be null when the target appointment has no personal report yet. */
  expectedTechUpdatedAt: string | null;
  outcome: VisitOutcomeStatus;
  completion: string;
  outstanding: string;
  issuesText: string;
  followUp: boolean;
  reportDirty: boolean;
  reportSavedFlash: boolean;
  reportPending: boolean;
  busy: null;
};

/**
 * Build a clean client form state for an appointment.
 * Used when soft-navigating between visits so Saved flash / busy / dirty /
 * stale expectedTechUpdatedAt cannot leak across appointments.
 */
export function buildVisitReportFormStateForAppointment(
  snapshot: VisitReportFormServerSnapshot,
): VisitReportFormClientState {
  return {
    appointmentId: snapshot.appointmentId,
    expectedStatus: snapshot.fieldStatus,
    expectedCompletion: snapshot.sharedCompletionNote ?? '',
    expectedOutstanding: snapshot.sharedOutstandingWork ?? '',
    expectedIssues: snapshot.sharedIssues ?? '',
    expectedFollowUp: snapshot.sharedFollowUpRequired,
    expectedTechUpdatedAt: snapshot.techReportUpdatedAt,
    outcome: snapshot.personalProgressStatus,
    completion: snapshot.completionNote ?? '',
    outstanding: snapshot.outstandingWork ?? '',
    issuesText: snapshot.issues ?? '',
    followUp: snapshot.followUpRequired,
    reportDirty: false,
    reportSavedFlash: false,
    reportPending: false,
    busy: null,
  };
}

/**
 * Soft-nav between visit routes reuses the client component unless remounted.
 * Callers must reset when appointmentId changes — never keep a previous
 * appointment's expectedTechUpdatedAt when opening a different visit.
 */
export function shouldResetVisitReportForm(
  previousAppointmentId: string | null | undefined,
  nextAppointmentId: string,
): boolean {
  if (!previousAppointmentId) return false;
  return previousAppointmentId !== nextAppointmentId;
}

/**
 * First save on an appointment with no personal row must omit expectedUpdatedAt.
 * Carrying a token from another visit causes a false concurrency conflict.
 */
export function expectedTechUpdatedAtForAppointment(input: {
  appointmentId: string;
  formAppointmentId: string;
  techReportUpdatedAt: string | null;
}): string | null {
  if (input.appointmentId !== input.formAppointmentId) return null;
  return input.techReportUpdatedAt;
}

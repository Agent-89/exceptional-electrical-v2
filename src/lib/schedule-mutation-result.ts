/** Shared schedule mutation result shapes (safe for client imports). */

export type ScheduleMutationSuccess = {
  ok: true;
  starts_at?: string;
  ends_at?: string;
};

export type ScheduleMutationFailure = {
  ok: false;
  code: 'hq_overlap' | 'neil_conflict' | 'validation' | 'conflict' | 'error';
  message: string;
};

export type ScheduleMutationResult = ScheduleMutationSuccess | ScheduleMutationFailure;

export function isScheduleMutationFailure(
  result: ScheduleMutationResult,
): result is ScheduleMutationFailure {
  return result.ok === false;
}

export function scheduleFailureMessage(result: ScheduleMutationResult, fallback: string): string {
  return result.ok ? fallback : result.message;
}

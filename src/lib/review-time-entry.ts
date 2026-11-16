/** Pure helpers for office time-entry review (approve / reject / correct). */

export type ReviewTimeDecision = 'approve' | 'reject' | 'correct';

export type ReviewTimeEntryResult =
  | { ok: true; noop?: boolean; message?: string }
  | { ok: false; error: string; code?: 'validation' | 'conflict' | 'forbidden' | 'unknown' };

export type ReviewTimeEntryFields = {
  decision: string;
  entryId: string;
  billableRaw: string;
  rejectionReason: string | null;
  correctionNote: string | null;
  startLocal: string;
  endLocal: string;
  breakMinutesRaw: string;
};

export type ReviewTimeEntrySnapshot = {
  status: string;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
  originalStartedAt: string | null;
  originalEndedAt: string | null;
  originalBreakMinutes: number | null;
  originalWorkedMinutes: number | null;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;
const LOCAL_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const REVIEWABLE = new Set(['submitted', 'rejected', 'corrected', 'approved']);
const APPROVE_FROM = new Set(['submitted', 'rejected', 'corrected']);
const REJECT_FROM = new Set(['submitted', 'approved', 'corrected']);
const CORRECT_FROM = new Set(['submitted', 'approved', 'corrected', 'rejected']);

export function parseReviewTimeDecision(value: string): ReviewTimeDecision | null {
  if (value === 'approve' || value === 'reject' || value === 'correct') return value;
  return null;
}

export function canReviewTimeEntryStatus(status: string): boolean {
  return REVIEWABLE.has(status);
}

export function statusesForReviewDecision(decision: ReviewTimeDecision): string[] {
  if (decision === 'approve') return [...APPROVE_FROM];
  if (decision === 'reject') return [...REJECT_FROM];
  return [...CORRECT_FROM];
}

export function readReviewTimeEntryFields(formData: FormData): ReviewTimeEntryFields {
  const trim = (key: string, max: number): string | null => {
    const raw = String(formData.get(key) ?? '').trim();
    if (!raw) return null;
    return raw.slice(0, max);
  };
  return {
    decision: String(formData.get('decision') || ''),
    entryId: String(formData.get('entry_id') || ''),
    billableRaw: String(formData.get('billable_minutes') || '').trim(),
    rejectionReason: trim('rejection_reason', 2000),
    correctionNote: trim('correction_note', 2000),
    startLocal: String(formData.get('started_at') || ''),
    endLocal: String(formData.get('ended_at') || ''),
    breakMinutesRaw: String(formData.get('break_minutes') || '0'),
  };
}

export type ReviewTimeValidation =
  | { ok: false; error: string; code?: 'validation' | 'conflict' | 'forbidden' | 'unknown' }
  | { ok: true; decision: ReviewTimeDecision };

export function validateReviewTimeEntryRequest(
  fields: ReviewTimeEntryFields,
  entry: ReviewTimeEntrySnapshot | null,
): ReviewTimeValidation {
  if (!UUID_RE.test(fields.entryId)) {
    return { ok: false, error: 'Invalid time entry.', code: 'validation' };
  }
  const decision = parseReviewTimeDecision(fields.decision);
  if (!decision) {
    return { ok: false, error: 'Invalid decision.', code: 'validation' };
  }
  if (!entry || !canReviewTimeEntryStatus(entry.status)) {
    return {
      ok: false,
      error: 'Only submitted time entries can be reviewed.',
      code: 'validation',
    };
  }
  if (decision === 'reject' && !fields.rejectionReason) {
    return { ok: false, error: 'Rejection reason is required.', code: 'validation' };
  }
  if (decision === 'correct') {
    if (!LOCAL_DT_RE.test(fields.startLocal) || !LOCAL_DT_RE.test(fields.endLocal)) {
      return { ok: false, error: 'Enter valid corrected times.', code: 'validation' };
    }
    if (!fields.correctionNote) {
      return {
        ok: false,
        error: 'Correction note is required for the audit trail.',
        code: 'validation',
      };
    }
    const startedAt = new Date(fields.startLocal + '+08:00');
    const endedAt = new Date(fields.endLocal + '+08:00');
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
      return { ok: false, error: 'Enter valid corrected times.', code: 'validation' };
    }
    if (endedAt <= startedAt) {
      return { ok: false, error: 'Corrected end must be after start.', code: 'validation' };
    }
  }
  return { ok: true, decision };
}

export function resolveBillableMinutes(
  billableRaw: string,
  fallbackWorked: number,
): number {
  if (billableRaw === '') return Math.max(0, fallbackWorked);
  return Math.max(0, Number(billableRaw) || 0);
}

export function parseBreakMinutes(raw: string): number {
  return Math.max(0, Math.min(24 * 60, Number(raw) || 0));
}

/** Detect an identical correction already persisted (repeat submit). */
export function isDuplicateCorrection(
  entry: ReviewTimeEntrySnapshot,
  next: {
    startedAt: string;
    endedAt: string;
    breakMinutes: number;
    workedMinutes: number;
    billableMinutes: number;
  },
): boolean {
  if (entry.status !== 'corrected') return false;
  if (entry.startedAt !== next.startedAt) return false;
  if (entry.endedAt !== next.endedAt) return false;
  if (entry.breakMinutes !== next.breakMinutes) return false;
  if ((entry.workedMinutes ?? null) !== next.workedMinutes) return false;
  if ((entry.billableMinutes ?? null) !== next.billableMinutes) return false;
  return true;
}

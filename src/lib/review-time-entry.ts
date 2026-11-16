/** Pure helpers for office time-entry review (approve / reject / correct). */

export type ReviewTimeDecision = 'approve' | 'reject' | 'correct';
export type BillableMode = 'auto' | 'manual';

function elapsedWholeMinutes(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

function computeWorkedMinutes(startedAt: string, endedAt: string, breakMinutes: number): number {
  return Math.max(0, elapsedWholeMinutes(startedAt, endedAt) - Math.max(0, breakMinutes));
}

function formatDurationMinutes(total: number): string {
  const m = Math.max(0, Math.floor(total));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${String(rem).padStart(2, '0')}m`;
}

export type ReviewTimeEntryResult =
  | { ok: true; noop?: boolean; message?: string }
  | { ok: false; error: string; code?: 'validation' | 'conflict' | 'forbidden' | 'unknown' };

export type ReviewTimeEntryFields = {
  decision: string;
  entryId: string;
  billableRaw: string;
  billableMode: BillableMode;
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
  correctionNote?: string | null;
  originalStartedAt: string | null;
  originalEndedAt: string | null;
  originalBreakMinutes: number | null;
  originalWorkedMinutes: number | null;
};

export type CorrectionTiming = {
  startedAt: string;
  endedAt: string;
  breakMinutes: number;
  elapsedMinutes: number;
  workedMinutes: number;
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

export function parseBillableMode(value: string): BillableMode {
  return value === 'manual' ? 'manual' : 'auto';
}

export function canReviewTimeEntryStatus(status: string): boolean {
  return REVIEWABLE.has(status);
}

export function statusesForReviewDecision(decision: ReviewTimeDecision): string[] {
  if (decision === 'approve') return [...APPROVE_FROM];
  if (decision === 'reject') return [...REJECT_FROM];
  return [...CORRECT_FROM];
}

/** Decisions the UI may offer for a given entry status (server still re-checks). */
export function allowedReviewDecisions(status: string): ReviewTimeDecision[] {
  const decisions: ReviewTimeDecision[] = [];
  if (APPROVE_FROM.has(status)) decisions.push('approve');
  if (REJECT_FROM.has(status)) decisions.push('reject');
  if (CORRECT_FROM.has(status)) decisions.push('correct');
  return decisions;
}

/** Stable activity action names — never `time_rejectd`. */
export function timeReviewActivityAction(decision: ReviewTimeDecision): string {
  if (decision === 'approve') return 'time_approved';
  if (decision === 'reject') return 'time_rejected';
  return 'time_corrected';
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
    billableMode: parseBillableMode(String(formData.get('billable_mode') || 'auto')),
    rejectionReason: trim('rejection_reason', 2000),
    correctionNote: trim('correction_note', 2000),
    startLocal: String(formData.get('started_at') || ''),
    endLocal: String(formData.get('ended_at') || ''),
    breakMinutesRaw: String(formData.get('break_minutes') || '0'),
  };
}

export type ReviewTimeValidation =
  | { ok: false; error: string; code?: 'validation' | 'conflict' | 'forbidden' | 'unknown' }
  | { ok: true; decision: ReviewTimeDecision; timing?: CorrectionTiming; billableMinutes?: number };

/** Narrow a validation result to the decision branch (never a noop/success action result). */
export function isReviewDecisionResult(
  result: ReviewTimeValidation | ReviewTimeEntryResult,
): result is { ok: true; decision: ReviewTimeDecision; timing?: CorrectionTiming; billableMinutes?: number } {
  return result.ok === true && 'decision' in result && result.decision != null;
}

export function parseBreakMinutes(raw: string): number {
  return Math.max(0, Math.min(24 * 60, Number(raw) || 0));
}

/** Perth wall-clock local values → absolute ISO. Overnight is valid when end Instant > start Instant. */
export function parsePerthLocalDateTime(local: string): Date | null {
  if (!LOCAL_DT_RE.test(local)) return null;
  const date = new Date(local + '+08:00');
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Recalculate elapsed/worked for a correction and reject impossible break/range values.
 * Overnight shifts are allowed when the absolute end is after the absolute start.
 */
export function buildCorrectionTiming(
  startLocal: string,
  endLocal: string,
  breakMinutesRaw: string,
): { ok: true; timing: CorrectionTiming } | { ok: false; error: string } {
  const started = parsePerthLocalDateTime(startLocal);
  const ended = parsePerthLocalDateTime(endLocal);
  if (!started || !ended) {
    return { ok: false, error: 'Enter valid corrected times.' };
  }
  if (ended.getTime() <= started.getTime()) {
    return { ok: false, error: 'Corrected end must be after start.' };
  }
  const breakMinutes = parseBreakMinutes(breakMinutesRaw);
  const startedAt = started.toISOString();
  const endedAt = ended.toISOString();
  const elapsedMinutes = elapsedWholeMinutes(startedAt, endedAt);
  if (breakMinutes > elapsedMinutes) {
    return {
      ok: false,
      error: `Break (${formatDurationMinutes(breakMinutes)}) cannot exceed elapsed time (${formatDurationMinutes(elapsedMinutes)}).`,
    };
  }
  const workedMinutes = computeWorkedMinutes(startedAt, endedAt, breakMinutes);
  if (workedMinutes < 0) {
    return { ok: false, error: 'Worked duration cannot be negative.' };
  }
  return {
    ok: true,
    timing: { startedAt, endedAt, breakMinutes, elapsedMinutes, workedMinutes },
  };
}

/** Auto billable tracks worked; manual preserves an explicit office override. */
export function resolveCorrectionBillableMinutes(
  mode: BillableMode,
  billableRaw: string,
  workedMinutes: number,
): number {
  if (mode === 'auto' || billableRaw === '') return Math.max(0, workedMinutes);
  return Math.max(0, Number(billableRaw) || 0);
}

/** @deprecated Prefer resolveCorrectionBillableMinutes with an explicit mode. */
export function resolveBillableMinutes(billableRaw: string, fallbackWorked: number): number {
  return resolveCorrectionBillableMinutes(
    billableRaw === '' ? 'auto' : 'manual',
    billableRaw,
    fallbackWorked,
  );
}

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
    if (!fields.correctionNote) {
      return {
        ok: false,
        error: 'Correction note is required for the audit trail.',
        code: 'validation',
      };
    }
    const timingResult = buildCorrectionTiming(
      fields.startLocal,
      fields.endLocal,
      fields.breakMinutesRaw,
    );
    if (!timingResult.ok) {
      return { ok: false, error: timingResult.error, code: 'validation' };
    }
    const billableMinutes = resolveCorrectionBillableMinutes(
      fields.billableMode,
      fields.billableRaw,
      timingResult.timing.workedMinutes,
    );
    return {
      ok: true,
      decision,
      timing: timingResult.timing,
      billableMinutes,
    };
  }
  return { ok: true, decision };
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
    correctionNote?: string | null;
  },
): boolean {
  if (entry.status !== 'corrected') return false;
  if (entry.startedAt !== next.startedAt) return false;
  if (entry.endedAt !== next.endedAt) return false;
  if (entry.breakMinutes !== next.breakMinutes) return false;
  if ((entry.workedMinutes ?? null) !== next.workedMinutes) return false;
  if ((entry.billableMinutes ?? null) !== next.billableMinutes) return false;
  if (next.correctionNote != null) {
    if ((entry.correctionNote ?? '').trim() !== next.correctionNote.trim()) return false;
  }
  return true;
}

function clockRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
  if (!endIso) return `${start} → open`;
  const end = new Date(endIso).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${start} → ${end}`;
}

export function formatTimeReviewActivityNote(input: {
  decision: ReviewTimeDecision;
  technicianName: string;
  previous: {
    startedAt: string;
    endedAt: string | null;
    breakMinutes: number;
    workedMinutes: number | null;
    billableMinutes: number | null;
  };
  next?: {
    startedAt: string;
    endedAt: string;
    breakMinutes: number;
    workedMinutes: number;
    billableMinutes: number;
    billableMode: BillableMode;
  };
  reason?: string | null;
}): string {
  const tech = input.technicianName || 'Technician';
  if (input.decision === 'approve') {
    const billable = input.next?.billableMinutes ?? input.previous.billableMinutes ?? input.previous.workedMinutes ?? 0;
    return `Approved ${formatDurationMinutes(billable)} billable for ${tech}`;
  }
  if (input.decision === 'reject') {
    const reason = input.reason?.trim();
    return reason ? `Rejected time for ${tech} · ${reason}` : `Rejected time for ${tech}`;
  }
  if (!input.next) return `Corrected time for ${tech}`;
  const prevWorked = input.previous.workedMinutes ?? 0;
  const prevBillable = input.previous.billableMinutes;
  const billableLabel =
    input.next.billableMode === 'manual'
      ? `billable ${formatDurationMinutes(input.next.billableMinutes)} (manual)`
      : `billable ${formatDurationMinutes(input.next.billableMinutes)} (auto)`;
  const change = [
    `${clockRange(input.previous.startedAt, input.previous.endedAt)} → ${clockRange(input.next.startedAt, input.next.endedAt)}`,
    `worked ${formatDurationMinutes(prevWorked)} → ${formatDurationMinutes(input.next.workedMinutes)}`,
    `break ${formatDurationMinutes(input.previous.breakMinutes)} → ${formatDurationMinutes(input.next.breakMinutes)}`,
    prevBillable == null
      ? billableLabel
      : `billable ${formatDurationMinutes(prevBillable)} → ${formatDurationMinutes(input.next.billableMinutes)}${input.next.billableMode === 'manual' ? ' (manual)' : ' (auto)'}`,
  ].join(' · ');
  const reason = input.reason?.trim();
  return reason
    ? `Corrected time for ${tech}: ${change}. Reason: ${reason}`
    : `Corrected time for ${tech}: ${change}`;
}

/** UI helper: treat billable as overridden when it differs from worked. */
export function inferBillableMode(
  billableMinutes: number | null | undefined,
  workedMinutes: number | null | undefined,
): BillableMode {
  if (billableMinutes == null || workedMinutes == null) return 'auto';
  return billableMinutes === workedMinutes ? 'auto' : 'manual';
}

const ACTIVITY_TITLE: Record<string, string> = {
  created: 'Job created',
  status_changed: 'Status updated',
  note_added: 'Note added',
  details_updated: 'Job details updated',
  staff_assigned: 'Electrician assigned',
  staff_unassigned: 'Electrician removed',
  appointment_added: 'Appointment scheduled',
  time_started: 'Timer started',
  time_paused: 'Break started',
  time_resumed: 'Work resumed',
  time_submitted: 'Time submitted',
  time_manual_added: 'Manual time added',
  visit_progress_updated: 'Visit progress updated',
  visit_outcome_office_updated: 'Visit outcome updated',
  technician_work_report_saved: 'Technician work report saved',
  technician_note_added: 'Technician note',
  technician_note_edited: 'Technician note edited',
  photo_uploaded: 'Photo uploaded',
  office_note_added: 'Office note',
  time_approved: 'Time approved',
  time_rejected: 'Time rejected',
  /** Legacy misspelling from earlier builds — present without rewriting history. */
  time_rejectd: 'Time rejected',
  time_corrected: 'Time corrected',
  follow_up_resolved: 'Further visit resolved',
};

export function jobActivityActionTitle(action: string): string {
  return ACTIVITY_TITLE[action] ?? action.replaceAll('_', ' ');
}

/** Close the inline editor only after confirmed correct/reject (not optimistic). */
export function shouldCloseInlineTimeEditor(decision: ReviewTimeDecision): boolean {
  return decision === 'correct' || decision === 'reject';
}

const LONG_NOTE = 110;

function withTechnicianTitle(base: string, technician: string | null): string {
  const name = (technician ?? '').trim();
  return name ? `${base} · ${name}` : base;
}

function extractWorkedChange(note: string): string | null {
  const match = note.match(/worked\s+(\d+h(?:\s+\d{1,2}m)?|\d+m)\s*→\s*(\d+h(?:\s+\d{1,2}m)?|\d+m)/i);
  if (!match) return null;
  return `Worked: ${match[1]} → ${match[2]}`;
}

/**
 * Presentation-only activity view: concise title/summary with expandable full note.
 * Does not rewrite stored history.
 */
export function presentJobActivityEvent(
  action: string,
  note: string | null | undefined,
): {
  title: string;
  summary: string | null;
  detail: string | null;
  expandable: boolean;
} {
  const trimmed = (note ?? '').trim();
  const baseTitle = jobActivityActionTitle(action);

  if (action === 'time_corrected') {
    const techMatch = trimmed.match(/^Corrected time for ([^:]+):/i);
    const tech = techMatch?.[1]?.trim() ?? null;
    const worked = extractWorkedChange(trimmed);
    return {
      title: withTechnicianTitle(baseTitle, tech),
      summary: worked ?? (trimmed ? 'Time values updated' : null),
      detail: trimmed || null,
      expandable: Boolean(trimmed),
    };
  }

  if (action === 'time_approved') {
    const techMatch = trimmed.match(/billable for (.+)$/i);
    const amountMatch = trimmed.match(/^Approved\s+(.+?)\s+billable/i);
    const tech = techMatch?.[1]?.trim() ?? null;
    const amount = amountMatch?.[1]?.trim();
    return {
      title: withTechnicianTitle(baseTitle, tech),
      summary: amount ? `${amount} billable approved` : trimmed || null,
      detail: trimmed && amount ? trimmed : null,
      expandable: Boolean(trimmed && amount && trimmed.length > 60),
    };
  }

  if (action === 'time_rejected' || action === 'time_rejectd') {
    const techMatch = trimmed.match(/^Rejected time for ([^·]+?)(?:\s*·\s*|$)/i);
    const tech = techMatch?.[1]?.trim() ?? null;
    const reason = trimmed.includes('·')
      ? trimmed.slice(trimmed.indexOf('·') + 1).trim()
      : '';
    const shortReason =
      reason.length > 80 ? `${reason.slice(0, 77).trim()}…` : reason || 'Rejected';
    return {
      title: withTechnicianTitle(baseTitle, tech),
      summary: shortReason,
      detail: reason || trimmed || null,
      expandable: Boolean(reason),
    };
  }

  if (action === 'appointment_added') {
    return {
      title: baseTitle,
      summary: trimmed ? (trimmed.length > LONG_NOTE ? `${trimmed.slice(0, LONG_NOTE).trim()}…` : trimmed) : null,
      detail: trimmed && trimmed.length > LONG_NOTE ? trimmed : null,
      expandable: Boolean(trimmed && trimmed.length > LONG_NOTE),
    };
  }

  if (action === 'visit_progress_updated' || action === 'visit_outcome_office_updated') {
    return {
      title: action === 'visit_outcome_office_updated' ? 'Visit outcome updated' : baseTitle,
      summary: trimmed
        ? trimmed.length > LONG_NOTE
          ? `${trimmed.slice(0, LONG_NOTE).trim()}…`
          : trimmed
        : null,
      detail: trimmed && trimmed.length > LONG_NOTE ? trimmed : null,
      expandable: Boolean(trimmed && trimmed.length > LONG_NOTE),
    };
  }

  if (action === 'follow_up_resolved') {
    const summary = trimmed.includes('.')
      ? trimmed.slice(0, trimmed.indexOf('.') + 1).trim()
      : trimmed || null;
    return {
      title: baseTitle,
      summary,
      detail: trimmed && summary && trimmed !== summary ? trimmed : null,
      expandable: Boolean(trimmed && summary && trimmed !== summary),
    };
  }

  if (!trimmed) {
    return { title: baseTitle, summary: null, detail: null, expandable: false };
  }
  if (trimmed.length <= LONG_NOTE) {
    return { title: baseTitle, summary: trimmed, detail: null, expandable: false };
  }
  return {
    title: baseTitle,
    summary: `${trimmed.slice(0, LONG_NOTE).trim()}…`,
    detail: trimmed,
    expandable: true,
  };
}

/** @deprecated Prefer presentJobActivityEvent(action, note). */
export function presentJobActivityNote(note: string | null | undefined): {
  summary: string | null;
  detail: string | null;
  expandable: boolean;
} {
  const presented = presentJobActivityEvent('note_added', note);
  return {
    summary: presented.summary,
    detail: presented.detail,
    expandable: presented.expandable,
  };
}

/** Format an activity timestamp in Perth local time (consistent en-AU). */
export function formatJobActivityWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

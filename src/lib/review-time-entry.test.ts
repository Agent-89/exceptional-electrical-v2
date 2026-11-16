import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  allowedReviewDecisions,
  buildCorrectionTiming,
  formatJobActivityWhen,
  formatTimeReviewActivityNote,
  inferBillableMode,
  isDuplicateCorrection,
  isReviewDecisionResult,
  jobActivityActionTitle,
  parseReviewTimeDecision,
  presentJobActivityNote,
  readReviewTimeEntryFields,
  resolveCorrectionBillableMinutes,
  statusesForReviewDecision,
  timeReviewActivityAction,
  validateReviewTimeEntryRequest,
  type ReviewTimeEntryResult,
  type ReviewTimeEntrySnapshot,
} from './review-time-entry.ts';

const actionsSource = readFileSync(
  new URL('../app/hq/tech/actions.ts', import.meta.url),
  'utf8',
);
const formSource = readFileSync(
  new URL('../app/hq/time-entry-review-form.tsx', import.meta.url),
  'utf8',
);

const ENTRY: ReviewTimeEntrySnapshot = {
  status: 'submitted',
  startedAt: '2026-11-16T01:00:00.000Z',
  endedAt: '2026-11-16T03:00:00.000Z',
  breakMinutes: 15,
  workedMinutes: 105,
  billableMinutes: null,
  correctionNote: null,
  originalStartedAt: null,
  originalEndedAt: null,
  originalBreakMinutes: null,
  originalWorkedMinutes: null,
};

describe('parseReviewTimeDecision', () => {
  it('accepts approve reject correct only', () => {
    assert.equal(parseReviewTimeDecision('correct'), 'correct');
    assert.equal(parseReviewTimeDecision('approve'), 'approve');
    assert.equal(parseReviewTimeDecision('reject'), 'reject');
    assert.equal(parseReviewTimeDecision(''), null);
  });
});

describe('buildCorrectionTiming', () => {
  it('recalculates worked minutes from start end and break', () => {
    const result = buildCorrectionTiming('2026-11-16T09:00', '2026-11-16T11:00', '15');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.timing.elapsedMinutes, 120);
      assert.equal(result.timing.workedMinutes, 105);
    }
  });

  it('allows overnight shifts when absolute end is after start', () => {
    const result = buildCorrectionTiming('2026-11-16T22:00', '2026-11-17T02:00', '30');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.timing.elapsedMinutes, 240);
      assert.equal(result.timing.workedMinutes, 210);
    }
  });

  it('rejects breaks that exceed elapsed time', () => {
    const result = buildCorrectionTiming('2026-11-16T09:00', '2026-11-16T10:00', '90');
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /cannot exceed elapsed/);
  });

  it('rejects end before start', () => {
    const result = buildCorrectionTiming('2026-11-16T11:00', '2026-11-16T09:00', '0');
    assert.equal(result.ok, false);
  });
});

describe('resolveCorrectionBillableMinutes', () => {
  it('defaults auto billable to worked and preserves manual overrides', () => {
    assert.equal(resolveCorrectionBillableMinutes('auto', '', 105), 105);
    assert.equal(resolveCorrectionBillableMinutes('auto', '999', 105), 105);
    assert.equal(resolveCorrectionBillableMinutes('manual', '90', 105), 90);
  });
});

describe('inferBillableMode', () => {
  it('marks mismatched billable as manual', () => {
    assert.equal(inferBillableMode(105, 105), 'auto');
    assert.equal(inferBillableMode(90, 105), 'manual');
  });
});

describe('validateReviewTimeEntryRequest', () => {
  it('soft-fails when correction note is missing (Production digest 2555879783)', () => {
    const result = validateReviewTimeEntryRequest(
      {
        decision: 'correct',
        entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
        billableRaw: '90',
        billableMode: 'manual',
        rejectionReason: null,
        correctionNote: null,
        startLocal: '2026-11-16T09:00',
        endLocal: '2026-11-16T11:00',
        breakMinutesRaw: '15',
      },
      ENTRY,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Correction note is required/);
  });

  it('accepts a complete correction and returns timing plus billable', () => {
    const result = validateReviewTimeEntryRequest(
      {
        decision: 'correct',
        entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
        billableRaw: '',
        billableMode: 'auto',
        rejectionReason: null,
        correctionNote: 'Adjusted lunch break',
        startLocal: '2026-11-16T09:00',
        endLocal: '2026-11-16T11:00',
        breakMinutesRaw: '15',
      },
      ENTRY,
    );
    assert.equal(result.ok, true);
    assert.ok(isReviewDecisionResult(result));
    assert.equal(result.decision, 'correct');
    assert.equal(result.timing?.workedMinutes, 105);
    assert.equal(result.billableMinutes, 105);
  });

  it('rejects break longer than elapsed on the server path', () => {
    const result = validateReviewTimeEntryRequest(
      {
        decision: 'correct',
        entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
        billableRaw: '',
        billableMode: 'auto',
        rejectionReason: null,
        correctionNote: 'Bad break',
        startLocal: '2026-11-16T09:00',
        endLocal: '2026-11-16T09:30',
        breakMinutesRaw: '45',
      },
      ENTRY,
    );
    assert.equal(result.ok, false);
  });
});

describe('readReviewTimeEntryFields', () => {
  it('reads billable mode and trims blank correction notes', () => {
    const fd = new FormData();
    fd.set('decision', 'correct');
    fd.set('entry_id', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099');
    fd.set('billable_mode', 'manual');
    fd.set('correction_note', '   ');
    fd.set('started_at', '2026-11-16T09:00');
    fd.set('ended_at', '2026-11-16T11:00');
    const fields = readReviewTimeEntryFields(fd);
    assert.equal(fields.correctionNote, null);
    assert.equal(fields.billableMode, 'manual');
  });
});

describe('isDuplicateCorrection', () => {
  it('treats identical corrected submissions as no-ops including note', () => {
    const corrected: ReviewTimeEntrySnapshot = {
      ...ENTRY,
      status: 'corrected',
      billableMinutes: 100,
      correctionNote: 'Same note',
    };
    assert.equal(
      isDuplicateCorrection(corrected, {
        startedAt: corrected.startedAt,
        endedAt: corrected.endedAt!,
        breakMinutes: corrected.breakMinutes,
        workedMinutes: corrected.workedMinutes!,
        billableMinutes: 100,
        correctionNote: 'Same note',
      }),
      true,
    );
    assert.equal(
      isDuplicateCorrection(corrected, {
        startedAt: corrected.startedAt,
        endedAt: corrected.endedAt!,
        breakMinutes: corrected.breakMinutes,
        workedMinutes: corrected.workedMinutes!,
        billableMinutes: 100,
        correctionNote: 'Different note',
      }),
      false,
    );
  });
});

describe('formatTimeReviewActivityNote', () => {
  it('writes human-readable correction summaries without raw UUIDs', () => {
    const note = formatTimeReviewActivityNote({
      decision: 'correct',
      technicianName: 'Sam Rivera',
      previous: {
        startedAt: '2026-11-16T01:00:00.000Z',
        endedAt: '2026-11-16T03:00:00.000Z',
        breakMinutes: 15,
        workedMinutes: 105,
        billableMinutes: 105,
      },
      next: {
        startedAt: '2026-11-16T01:00:00.000Z',
        endedAt: '2026-11-16T03:30:00.000Z',
        breakMinutes: 15,
        workedMinutes: 135,
        billableMinutes: 120,
        billableMode: 'manual',
      },
      reason: 'Customer asked for extra tidy-up',
    });
    assert.match(note, /Sam Rivera/);
    assert.match(note, /worked/);
    assert.match(note, /Reason: Customer asked for extra tidy-up/);
    assert.doesNotMatch(note, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});

describe('statusesForReviewDecision', () => {
  it('keeps approve/reject/correct status gates', () => {
    assert.deepEqual(statusesForReviewDecision('approve'), [
      'submitted',
      'rejected',
      'corrected',
    ]);
  });
});

describe('isReviewDecisionResult', () => {
  it('narrows decision results away from action noop success results', () => {
    const validated = validateReviewTimeEntryRequest(
      {
        decision: 'approve',
        entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
        billableRaw: '',
        billableMode: 'auto',
        rejectionReason: null,
        correctionNote: null,
        startLocal: '',
        endLocal: '',
        breakMinutesRaw: '0',
      },
      ENTRY,
    );
    const noopSuccess: ReviewTimeEntryResult = {
      ok: true,
      noop: true,
      message: 'Correction already saved.',
    };
    assert.equal(isReviewDecisionResult(validated), true);
    assert.equal(isReviewDecisionResult(noopSuccess), false);
  });
});

describe('allowedReviewDecisions and activity action names', () => {
  it('exposes approve/reject/correct by status and never writes time_rejectd', () => {
    assert.deepEqual(allowedReviewDecisions('submitted'), [
      'approve',
      'reject',
      'correct',
    ]);
    assert.deepEqual(allowedReviewDecisions('approved'), ['reject', 'correct']);
    assert.deepEqual(allowedReviewDecisions('active'), []);
    assert.equal(timeReviewActivityAction('approve'), 'time_approved');
    assert.equal(timeReviewActivityAction('reject'), 'time_rejected');
    assert.equal(timeReviewActivityAction('correct'), 'time_corrected');
    assert.match(actionsSource, /timeReviewActivityAction\(decision\)/);
    assert.doesNotMatch(actionsSource, /action:\s*'time_' \+ decision \+ 'd'/);
  });
});

describe('activity presentation polish', () => {
  it('titles legacy reject spelling and expands long correction notes', () => {
    assert.equal(jobActivityActionTitle('time_rejected'), 'Time rejected');
    assert.equal(jobActivityActionTitle('time_rejectd'), 'Time rejected');
    const short = presentJobActivityNote('Approved 2h 00m billable for Sam');
    assert.equal(short.expandable, false);
    assert.equal(short.summary, 'Approved 2h 00m billable for Sam');
    const long = presentJobActivityNote(
      'Corrected time for Sam Rivera: 16 Nov, 9:00 am → 11:00 am → 16 Nov, 9:00 am → 11:30 am · worked 1h 45m → 2h 15m · break 15m → 15m · billable 1h 45m → 2h 00m (manual). Reason: Customer asked for extra tidy-up after the crew left site',
    );
    assert.equal(long.expandable, true);
    assert.match(long.summary || '', /Corrected time for Sam Rivera/);
    assert.match(long.detail || '', /Reason:/);
    const when = formatJobActivityWhen('2026-11-16T01:00:00.000Z');
    assert.match(when, /2026/);
    assert.match(when, /:/);
  });

  it('keeps inline form dirty and cancel hooks for the unified editor', () => {
    assert.match(formSource, /onDirtyChange/);
    assert.match(formSource, /onCancel/);
    assert.match(formSource, /Discard unsaved time changes/);
    assert.match(formSource, /allowedReviewDecisions/);
    assert.match(formSource, /ee-form-error/);
    assert.match(formSource, /ee-form-success/);
  });
});

describe('corrected worked and billable calculations', () => {
  it('recalculates worked and auto/manual billable for office corrections', () => {
    const timing = buildCorrectionTiming('2026-11-16T09:00', '2026-11-16T12:00', '30');
    assert.equal(timing.ok, true);
    if (!timing.ok) return;
    assert.equal(timing.timing.workedMinutes, 150);
    assert.equal(
      resolveCorrectionBillableMinutes('auto', '999', timing.timing.workedMinutes),
      150,
    );
    assert.equal(
      resolveCorrectionBillableMinutes('manual', '120', timing.timing.workedMinutes),
      120,
    );
    const invalid = buildCorrectionTiming('2026-11-16T12:00', '2026-11-16T09:00', '0');
    assert.equal(invalid.ok, false);
    const tooMuchBreak = buildCorrectionTiming('2026-11-16T09:00', '2026-11-16T10:00', '90');
    assert.equal(tooMuchBreak.ok, false);
  });
});

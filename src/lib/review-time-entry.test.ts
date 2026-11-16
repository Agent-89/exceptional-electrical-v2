import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCorrectionTiming,
  formatTimeReviewActivityNote,
  inferBillableMode,
  isDuplicateCorrection,
  isReviewDecisionResult,
  parseReviewTimeDecision,
  readReviewTimeEntryFields,
  resolveCorrectionBillableMinutes,
  statusesForReviewDecision,
  validateReviewTimeEntryRequest,
  type ReviewTimeEntryResult,
  type ReviewTimeEntrySnapshot,
} from './review-time-entry.ts';

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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isDuplicateCorrection,
  parseReviewTimeDecision,
  readReviewTimeEntryFields,
  resolveBillableMinutes,
  statusesForReviewDecision,
  validateReviewTimeEntryRequest,
  type ReviewTimeEntrySnapshot,
} from './review-time-entry.ts';

const ENTRY: ReviewTimeEntrySnapshot = {
  status: 'submitted',
  startedAt: '2026-11-16T01:00:00.000Z',
  endedAt: '2026-11-16T03:00:00.000Z',
  breakMinutes: 15,
  workedMinutes: 105,
  billableMinutes: null,
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
    assert.equal(parseReviewTimeDecision('save'), null);
  });
});

describe('validateReviewTimeEntryRequest', () => {
  it('soft-fails when correction note is missing (Production digest 2555879783)', () => {
    const fields = {
      decision: 'correct',
      entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
      billableRaw: '90',
      rejectionReason: null,
      correctionNote: null,
      startLocal: '2026-11-16T09:00',
      endLocal: '2026-11-16T11:00',
      breakMinutesRaw: '15',
    };
    const result = validateReviewTimeEntryRequest(fields, ENTRY);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /Correction note is required/);
      assert.equal(result.code, 'validation');
    }
  });

  it('accepts a complete correction payload', () => {
    const fields = {
      decision: 'correct',
      entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
      billableRaw: '90',
      rejectionReason: null,
      correctionNote: 'Adjusted lunch break',
      startLocal: '2026-11-16T09:00',
      endLocal: '2026-11-16T11:00',
      breakMinutesRaw: '15',
    };
    const result = validateReviewTimeEntryRequest(fields, ENTRY);
    assert.deepEqual(result, { ok: true, decision: 'correct' });
  });

  it('requires rejection reason', () => {
    const fields = {
      decision: 'reject',
      entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
      billableRaw: '',
      rejectionReason: null,
      correctionNote: null,
      startLocal: '',
      endLocal: '',
      breakMinutesRaw: '0',
    };
    const result = validateReviewTimeEntryRequest(fields, ENTRY);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /Rejection reason/);
  });

  it('rejects corrected end before start', () => {
    const fields = {
      decision: 'correct',
      entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
      billableRaw: '',
      rejectionReason: null,
      correctionNote: 'fix times',
      startLocal: '2026-11-16T11:00',
      endLocal: '2026-11-16T09:00',
      breakMinutesRaw: '0',
    };
    const result = validateReviewTimeEntryRequest(fields, ENTRY);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /end must be after start/);
  });

  it('blocks live timer statuses', () => {
    const fields = {
      decision: 'approve',
      entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099',
      billableRaw: '',
      rejectionReason: null,
      correctionNote: null,
      startLocal: '',
      endLocal: '',
      breakMinutesRaw: '0',
    };
    const result = validateReviewTimeEntryRequest(fields, { ...ENTRY, status: 'active' });
    assert.equal(result.ok, false);
  });
});

describe('readReviewTimeEntryFields', () => {
  it('trims correction note and treats blank as null', () => {
    const fd = new FormData();
    fd.set('decision', 'correct');
    fd.set('entry_id', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099');
    fd.set('correction_note', '   ');
    fd.set('started_at', '2026-11-16T09:00');
    fd.set('ended_at', '2026-11-16T11:00');
    const fields = readReviewTimeEntryFields(fd);
    assert.equal(fields.correctionNote, null);
  });
});

describe('resolveBillableMinutes', () => {
  it('falls back to worked minutes when blank', () => {
    assert.equal(resolveBillableMinutes('', 105), 105);
    assert.equal(resolveBillableMinutes('90', 105), 90);
  });
});

describe('statusesForReviewDecision', () => {
  it('keeps approve/reject/correct status gates', () => {
    assert.deepEqual(statusesForReviewDecision('approve'), [
      'submitted',
      'rejected',
      'corrected',
    ]);
    assert.deepEqual(statusesForReviewDecision('reject'), [
      'submitted',
      'approved',
      'corrected',
    ]);
    assert.ok(statusesForReviewDecision('correct').includes('rejected'));
  });
});

describe('isDuplicateCorrection', () => {
  it('detects an identical already-corrected entry', () => {
    const corrected: ReviewTimeEntrySnapshot = {
      ...ENTRY,
      status: 'corrected',
      startedAt: '2026-11-16T01:00:00.000Z',
      endedAt: '2026-11-16T03:00:00.000Z',
      breakMinutes: 15,
      workedMinutes: 105,
      billableMinutes: 100,
    };
    assert.equal(
      isDuplicateCorrection(corrected, {
        startedAt: '2026-11-16T01:00:00.000Z',
        endedAt: '2026-11-16T03:00:00.000Z',
        breakMinutes: 15,
        workedMinutes: 105,
        billableMinutes: 100,
      }),
      true,
    );
    assert.equal(
      isDuplicateCorrection(corrected, {
        startedAt: '2026-11-16T01:00:00.000Z',
        endedAt: '2026-11-16T03:30:00.000Z',
        breakMinutes: 15,
        workedMinutes: 135,
        billableMinutes: 100,
      }),
      false,
    );
  });
});

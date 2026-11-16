import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  isScheduleMutationFailure,
  scheduleFailureMessage,
  type ScheduleMutationResult,
} from './schedule-mutation-result.ts';

describe('schedule mutation results', () => {
  it('treats structured overlap failures as recoverable client messages', () => {
    const failure: ScheduleMutationResult = {
      ok: false,
      code: 'hq_overlap',
      message: 'Scheduling conflict: an electrician already has an overlapping HQ visit.',
    };
    assert.equal(isScheduleMutationFailure(failure), true);
    assert.match(scheduleFailureMessage(failure, 'fallback'), /Scheduling conflict/);
    assert.equal(scheduleFailureMessage({ok: true}, 'fallback'), 'fallback');
  });
});

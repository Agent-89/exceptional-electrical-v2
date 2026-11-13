import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isValidFollowUpDueDate } from './follow-up-due-date.ts';

describe('isValidFollowUpDueDate', () => {
  it('accepts YYYY-MM-DD dates', () => {
    assert.equal(isValidFollowUpDueDate('2026-11-13'), true);
    assert.equal(isValidFollowUpDueDate('1999-01-01'), true);
  });

  it('accepts an empty string so a due date can be cleared', () => {
    assert.equal(isValidFollowUpDueDate(''), true);
  });

  it('rejects non-date values that previously slipped through a broken \\\\d regex', () => {
    assert.equal(isValidFollowUpDueDate('\\d{4}-\\d{2}-\\d{2}'), false);
    assert.equal(isValidFollowUpDueDate('13-11-2026'), false);
    assert.equal(isValidFollowUpDueDate('2026/11/13'), false);
    assert.equal(isValidFollowUpDueDate('2026-11-13T09:00'), false);
    assert.equal(isValidFollowUpDueDate('not-a-date'), false);
  });
});

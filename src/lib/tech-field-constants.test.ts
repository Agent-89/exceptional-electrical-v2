import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fieldStatusChipModifier,
  fieldVisitStatusLabel,
} from './tech-field-constants.ts';

describe('fieldVisitStatusLabel', () => {
  it('prefers live field status over visit status', () => {
    assert.equal(fieldVisitStatusLabel('in_progress', 'scheduled'), 'In progress');
    assert.equal(fieldVisitStatusLabel('paused', 'completed'), 'Paused');
  });

  it('falls back to visit status when field is scheduled or empty', () => {
    assert.equal(fieldVisitStatusLabel('scheduled', 'completed'), 'completed');
    assert.equal(fieldVisitStatusLabel(null, 'scheduled'), 'Scheduled');
    assert.equal(fieldVisitStatusLabel(undefined, undefined), 'Scheduled');
  });
});

describe('fieldStatusChipModifier', () => {
  it('maps known field statuses to chip modifiers', () => {
    assert.equal(fieldStatusChipModifier('in_progress'), 'is-in-progress');
    assert.equal(fieldStatusChipModifier('work_completed'), 'is-done');
    assert.equal(fieldStatusChipModifier('scheduled'), 'is-scheduled');
    assert.equal(fieldStatusChipModifier(null), 'is-scheduled');
  });
});

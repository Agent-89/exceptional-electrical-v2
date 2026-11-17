import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { nextJobStatusFromTrigger } from './job-statuses.ts';

describe('nextJobStatusFromTrigger', () => {
  it('promotes unassigned/assigned to scheduled on appointment create', () => {
    assert.equal(nextJobStatusFromTrigger('unassigned', 'appointment_created'), 'scheduled');
    assert.equal(nextJobStatusFromTrigger('assigned', 'appointment_created'), 'scheduled');
  });

  it('does not overwrite later statuses on appointment create', () => {
    assert.equal(nextJobStatusFromTrigger('scheduled', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('in_progress', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('on_hold', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('to_invoice', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('tafe', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('completed', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('cancelled', 'appointment_created'), null);
  });

  it('promotes early statuses to in_progress on work start', () => {
    assert.equal(nextJobStatusFromTrigger('unassigned', 'work_started'), 'in_progress');
    assert.equal(nextJobStatusFromTrigger('assigned', 'work_started'), 'in_progress');
    assert.equal(nextJobStatusFromTrigger('scheduled', 'work_started'), 'in_progress');
  });

  it('preserves hold, invoice, tafe and terminal statuses on work start', () => {
    assert.equal(nextJobStatusFromTrigger('in_progress', 'work_started'), null);
    assert.equal(nextJobStatusFromTrigger('on_hold', 'work_started'), null);
    assert.equal(nextJobStatusFromTrigger('to_invoice', 'work_started'), null);
    assert.equal(nextJobStatusFromTrigger('tafe', 'work_started'), null);
    assert.equal(nextJobStatusFromTrigger('completed', 'work_started'), null);
    assert.equal(nextJobStatusFromTrigger('cancelled', 'work_started'), null);
  });

  it('promotes unassigned to assigned when staff is assigned', () => {
    assert.equal(nextJobStatusFromTrigger('unassigned', 'staff_assigned'), 'assigned');
    assert.equal(nextJobStatusFromTrigger('assigned', 'staff_assigned'), null);
    assert.equal(nextJobStatusFromTrigger('scheduled', 'staff_assigned'), null);
    assert.equal(nextJobStatusFromTrigger('on_hold', 'staff_assigned'), null);
    assert.equal(nextJobStatusFromTrigger('to_invoice', 'staff_assigned'), null);
    assert.equal(nextJobStatusFromTrigger('tafe', 'staff_assigned'), null);
  });

  it('rejects unknown current statuses', () => {
    assert.equal(nextJobStatusFromTrigger('archived', 'appointment_created'), null);
    assert.equal(nextJobStatusFromTrigger('', 'work_started'), null);
  });
});

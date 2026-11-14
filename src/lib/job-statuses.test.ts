import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isJobStatus,
  isSchedulableJobStatus,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
} from './job-statuses.ts';

describe('JOB_STATUSES', () => {
  it('matches the verified production status check', () => {
    assert.deepEqual([...JOB_STATUSES], [
      'unassigned',
      'assigned',
      'scheduled',
      'in_progress',
      'on_hold',
      'completed',
      'cancelled',
    ]);
  });

  it('does not include archived', () => {
    assert.equal(isJobStatus('archived'), false);
    assert.equal((JOB_STATUSES as readonly string[]).includes('archived'), false);
  });

  it('provides a label for every status', () => {
    for (const status of JOB_STATUSES) {
      assert.equal(typeof JOB_STATUS_LABELS[status], 'string');
      assert.ok(JOB_STATUS_LABELS[status].length > 0);
    }
  });
});

describe('isJobStatus', () => {
  it('accepts production statuses and rejects unknown values', () => {
    assert.equal(isJobStatus('unassigned'), true);
    assert.equal(isJobStatus('assigned'), true);
    assert.equal(isJobStatus('scheduled'), true);
    assert.equal(isJobStatus('in_progress'), true);
    assert.equal(isJobStatus('on_hold'), true);
    assert.equal(isJobStatus('completed'), true);
    assert.equal(isJobStatus('cancelled'), true);
    assert.equal(isJobStatus('archived'), false);
    assert.equal(isJobStatus(''), false);
    assert.equal(isJobStatus('unknown'), false);
  });
});

describe('isSchedulableJobStatus', () => {
  it('allows recognized active statuses', () => {
    assert.equal(isSchedulableJobStatus('unassigned'), true);
    assert.equal(isSchedulableJobStatus('assigned'), true);
    assert.equal(isSchedulableJobStatus('scheduled'), true);
    assert.equal(isSchedulableJobStatus('in_progress'), true);
    assert.equal(isSchedulableJobStatus('on_hold'), true);
  });

  it('blocks completed and cancelled jobs', () => {
    assert.equal(isSchedulableJobStatus('completed'), false);
    assert.equal(isSchedulableJobStatus('cancelled'), false);
  });

  it('rejects unknown statuses including archived', () => {
    assert.equal(isSchedulableJobStatus('archived'), false);
    assert.equal(isSchedulableJobStatus(''), false);
    assert.equal(isSchedulableJobStatus('pending'), false);
  });
});

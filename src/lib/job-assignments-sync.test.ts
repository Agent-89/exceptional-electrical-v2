import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectStaffToAddToJob } from './job-assignments-sync.ts';

describe('selectStaffToAddToJob', () => {
  it('unions new staff without removing existing members', () => {
    assert.deepEqual(selectStaffToAddToJob(['a', 'b'], ['b', 'c', 'c']), ['c']);
  });

  it('returns empty when everyone is already assigned', () => {
    assert.deepEqual(selectStaffToAddToJob(['a', 'b'], ['a', 'b']), []);
  });

  it('ignores empty incoming ids', () => {
    assert.deepEqual(selectStaffToAddToJob(['a'], ['', 'a', 'd']), ['d']);
    assert.deepEqual(selectStaffToAddToJob([], []), []);
  });
});

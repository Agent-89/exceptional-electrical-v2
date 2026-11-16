import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canReviewJobTimeEntry,
  filterJobTimeEntries,
  jobTimeListSummary,
  sortJobTimeEntries,
} from './job-time-list.ts';

describe('job time list', () => {
  it('puts pending entries first then newest start time', () => {
    const sorted = sortJobTimeEntries([
      { id: '1', status: 'approved', startedAt: '2026-11-16T04:00:00.000Z' },
      { id: '2', status: 'submitted', startedAt: '2026-11-15T04:00:00.000Z' },
      { id: '3', status: 'rejected', startedAt: '2026-11-16T05:00:00.000Z' },
      { id: '4', status: 'cancelled', startedAt: '2026-11-17T04:00:00.000Z' },
    ]);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['3', '2', '1'],
    );
  });

  it('filters pending without duplicating the all list', () => {
    const rows = [
      { id: '1', status: 'submitted', startedAt: '2026-11-16T04:00:00.000Z' },
      { id: '2', status: 'approved', startedAt: '2026-11-16T03:00:00.000Z' },
      { id: '3', status: 'active', startedAt: '2026-11-16T05:00:00.000Z' },
    ];
    assert.deepEqual(
      filterJobTimeEntries(rows, 'pending').map((row) => row.id),
      ['1'],
    );
    assert.deepEqual(
      filterJobTimeEntries(rows, 'all').map((row) => row.id),
      ['1', '3', '2'],
    );
    const summary = jobTimeListSummary(rows);
    assert.equal(summary.pendingCount, 1);
    assert.equal(summary.liveCount, 1);
    assert.equal(summary.totalCount, 3);
    assert.equal(canReviewJobTimeEntry('submitted'), true);
    assert.equal(canReviewJobTimeEntry('active'), false);
  });
});

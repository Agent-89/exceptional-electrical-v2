import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  canReviewJobTimeEntry,
  filterJobTimeEntries,
  jobTimeListSummary,
  jobTimeStatusLabel,
  sortJobTimeEntries,
  uniqueJobTimeEntryIds,
} from './job-time-list.ts';

const panelSource = readFileSync(
  new URL('../app/hq/jobs/[id]/job-time-panel.tsx', import.meta.url),
  'utf8',
);
const pageSource = readFileSync(
  new URL('../app/hq/jobs/[id]/page.tsx', import.meta.url),
  'utf8',
);

const SAMPLE = [
  { id: '1', status: 'approved', startedAt: '2026-11-16T04:00:00.000Z' },
  { id: '2', status: 'submitted', startedAt: '2026-11-15T04:00:00.000Z' },
  { id: '3', status: 'rejected', startedAt: '2026-11-16T05:00:00.000Z' },
  { id: '4', status: 'cancelled', startedAt: '2026-11-17T04:00:00.000Z' },
  { id: '5', status: 'active', startedAt: '2026-11-16T06:00:00.000Z' },
];

describe('job time list', () => {
  it('puts pending entries first then newest start time', () => {
    const sorted = sortJobTimeEntries(SAMPLE);
    assert.deepEqual(
      sorted.map((row) => row.id),
      ['3', '2', '5', '1'],
    );
  });

  it('filters All / Pending / Approved without duplicating ids', () => {
    assert.deepEqual(
      filterJobTimeEntries(SAMPLE, 'pending').map((row) => row.id),
      ['3', '2'],
    );
    assert.deepEqual(
      filterJobTimeEntries(SAMPLE, 'approved').map((row) => row.id),
      ['1'],
    );
    assert.deepEqual(
      filterJobTimeEntries(SAMPLE, 'all').map((row) => row.id),
      ['3', '2', '5', '1'],
    );
    assert.deepEqual(uniqueJobTimeEntryIds(SAMPLE, 'all'), ['3', '2', '5', '1']);
    const summary = jobTimeListSummary(SAMPLE);
    assert.equal(summary.pendingCount, 2);
    assert.equal(summary.approvedCount, 1);
    assert.equal(summary.liveCount, 1);
    assert.equal(summary.totalCount, 4);
    assert.equal(canReviewJobTimeEntry('submitted'), true);
    assert.equal(canReviewJobTimeEntry('approved'), true);
    assert.equal(canReviewJobTimeEntry('active'), false);
    assert.equal(jobTimeStatusLabel('rejected'), 'Rejected');
    assert.equal(jobTimeStatusLabel('submitted'), 'Pending');
  });
});

describe('unified Time tab regression', () => {
  it('renders one entry once with inline Edit and no separate desktop review list', () => {
    assert.match(panelSource, /useState<JobTimeListFilter>\('all'\)/);
    assert.match(panelSource, /aria-controls=\{`time-editor-\$\{entry\.id\}`\}/);
    assert.match(panelSource, /aria-expanded=\{open\}/);
    assert.match(panelSource, /colSpan=\{9\}/);
    assert.match(panelSource, /Discard them and continue/);
    assert.match(panelSource, /beforeunload/);
    assert.match(panelSource, /Technician/);
    assert.match(panelSource, /Actions/);
    assert.equal((panelSource.match(/TimeEntryReviewForm/g) || []).length, 2);
    assert.doesNotMatch(panelSource, /ee-time-desktop-reviews/);
    assert.doesNotMatch(panelSource, /ee-time-review/);
    assert.doesNotMatch(pageSource, /ee-time-desktop-reviews/);
    assert.match(pageSource, /\.ee-time-inline-editor/);
    assert.match(pageSource, /\.ee-time-entry-head/);
    assert.match(pageSource, /@media\(min-width:900px\)\{[\s\S]*\.ee-time-entry-list\{display:none\}/);
  });

  it('defaults to All with pending-first ordering helpers', () => {
    const pendingFirst = sortJobTimeEntries([
      { id: 'a', status: 'approved', startedAt: '2026-11-16T10:00:00.000Z' },
      { id: 'b', status: 'submitted', startedAt: '2026-11-16T01:00:00.000Z' },
    ]);
    assert.deepEqual(
      pendingFirst.map((row) => row.id),
      ['b', 'a'],
    );
    assert.match(panelSource, /requestFilter\('all'\)/);
    assert.match(panelSource, /requestFilter\('pending'\)/);
    assert.match(panelSource, /requestFilter\('approved'\)/);
  });
});

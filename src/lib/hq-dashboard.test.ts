import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatDashboardHours,
  shiftPerthDayKey,
  sumAppointmentHours,
} from './hq-dashboard-metrics.ts';

describe('shiftPerthDayKey', () => {
  it('moves forward and backward by whole Perth days', () => {
    assert.equal(shiftPerthDayKey('2026-11-18', 1), '2026-11-19');
    assert.equal(shiftPerthDayKey('2026-11-18', -1), '2026-11-17');
  });
});

describe('sumAppointmentHours', () => {
  it('sums valid visit durations and ignores invalid rows', () => {
    const hours = sumAppointmentHours([
      { starts_at: '2026-11-18T01:00:00.000Z', ends_at: '2026-11-18T03:00:00.000Z' }, // 2h
      { starts_at: '2026-11-18T04:00:00.000Z', ends_at: '2026-11-18T04:30:00.000Z' }, // 0.5h
      { starts_at: '2026-11-18T05:00:00.000Z', ends_at: '2026-11-18T04:00:00.000Z' }, // invalid
    ]);
    assert.equal(hours, 2.5);
  });
});

describe('formatDashboardHours', () => {
  it('formats whole and fractional hours', () => {
    assert.equal(formatDashboardHours(0), '0 hrs');
    assert.equal(formatDashboardHours(1), '1 hr');
    assert.equal(formatDashboardHours(2.5), '2.5 hrs');
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTimesheetWeekRows,
  formatWeekCellMinutes,
  formatWeekRangeLabel,
  isTimesheetPendingHintStatus,
  perthWeekBounds,
  perthWeekDateKeys,
  perthWeekMonday,
  resolveTimesheetWeekMonday,
  shiftPerthDayKey,
  staffInitials,
} from './timesheet-week.ts';

describe('perth week bounds', () => {
  it('normalizes mid-week dates to Monday', () => {
    // 18 Nov 2026 is a Wednesday in Perth.
    assert.equal(perthWeekMonday('2026-11-18'), '2026-11-16');
    assert.equal(perthWeekMonday('2026-11-16'), '2026-11-16');
    assert.equal(perthWeekMonday('2026-11-22'), '2026-11-16');
  });

  it('returns Mon–Sun date keys', () => {
    assert.deepEqual(perthWeekDateKeys('2026-11-18'), [
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ]);
  });

  it('exposes inclusive Monday / exclusive next-Monday UTC bounds', () => {
    const { mondayKey, start, end } = perthWeekBounds('2026-11-18');
    assert.equal(mondayKey, '2026-11-16');
    assert.equal(start.toISOString(), '2026-11-15T16:00:00.000Z');
    assert.equal(end.toISOString(), '2026-11-22T16:00:00.000Z');
  });

  it('resolves week param or falls back to today', () => {
    assert.equal(resolveTimesheetWeekMonday('2026-11-19', '2026-11-01'), '2026-11-16');
    assert.equal(resolveTimesheetWeekMonday(undefined, '2026-11-18'), '2026-11-16');
    assert.equal(resolveTimesheetWeekMonday('nope', '2026-11-18'), '2026-11-16');
  });

  it('shifts day keys across month boundaries', () => {
    assert.equal(shiftPerthDayKey('2026-11-01', -1), '2026-10-31');
    assert.equal(shiftPerthDayKey('2026-11-16', 7), '2026-11-23');
  });
});

describe('pending hint status', () => {
  it('flags submitted and corrected only', () => {
    assert.equal(isTimesheetPendingHintStatus('submitted'), true);
    assert.equal(isTimesheetPendingHintStatus('corrected'), true);
    assert.equal(isTimesheetPendingHintStatus('rejected'), false);
    assert.equal(isTimesheetPendingHintStatus('approved'), false);
    assert.equal(isTimesheetPendingHintStatus('active'), false);
  });
});

describe('buildTimesheetWeekRows', () => {
  const weekKeys = perthWeekDateKeys('2026-11-18');
  const staff = [
    { id: 'staff-a', fullName: 'Billy Hicks' },
    { id: 'staff-b', fullName: 'Alex Rivera' },
  ];

  it('sums approved minutes and pending hints per day without counting rejected', () => {
    const rows = buildTimesheetWeekRows(
      staff,
      [
        {
          staffId: 'staff-a',
          startedAt: '2026-11-18T02:00:00.000Z', // Wed 10:00 Perth
          workedMinutes: 60,
          billableMinutes: 45,
          status: 'approved',
        },
        {
          staffId: 'staff-a',
          startedAt: '2026-11-18T04:00:00.000Z',
          workedMinutes: 30,
          billableMinutes: null,
          status: 'submitted',
        },
        {
          staffId: 'staff-a',
          startedAt: '2026-11-18T05:00:00.000Z',
          workedMinutes: 15,
          billableMinutes: 15,
          status: 'corrected',
        },
        {
          staffId: 'staff-a',
          startedAt: '2026-11-18T06:00:00.000Z',
          workedMinutes: 20,
          billableMinutes: 20,
          status: 'rejected',
        },
        {
          staffId: 'staff-b',
          startedAt: '2026-11-16T01:00:00.000Z', // Mon
          workedMinutes: 450,
          billableMinutes: 420,
          status: 'approved',
        },
      ],
      weekKeys,
    );

    const billy = rows.find((r) => r.staffId === 'staff-a')!;
    const alex = rows.find((r) => r.staffId === 'staff-b')!;
    const wed = billy.days[2];

    assert.equal(billy.initials, 'BH');
    assert.equal(wed.approvedWorkedMinutes, 60);
    assert.equal(wed.approvedBillableMinutes, 45);
    assert.equal(wed.pendingCount, 2);
    assert.equal(billy.weekApprovedWorkedMinutes, 60);
    assert.equal(billy.weekApprovedBillableMinutes, 45);
    assert.equal(billy.weekPendingCount, 2);

    assert.equal(alex.days[0].approvedWorkedMinutes, 450);
    assert.equal(alex.weekApprovedBillableMinutes, 420);
    assert.equal(alex.weekPendingCount, 0);
  });

  it('includes unknown staff that still have entries', () => {
    const rows = buildTimesheetWeekRows(
      staff,
      [
        {
          staffId: 'staff-gone',
          startedAt: '2026-11-17T02:00:00.000Z',
          workedMinutes: 10,
          billableMinutes: 10,
          status: 'approved',
        },
      ],
      weekKeys,
    );
    const orphan = rows.find((r) => r.staffId === 'staff-gone');
    assert.ok(orphan);
    assert.equal(orphan!.fullName, 'Unknown technician');
    assert.equal(orphan!.weekApprovedWorkedMinutes, 10);
  });

  it('ignores cancelled and out-of-week entries', () => {
    const rows = buildTimesheetWeekRows(
      staff,
      [
        {
          staffId: 'staff-a',
          startedAt: '2026-11-18T02:00:00.000Z',
          workedMinutes: 60,
          billableMinutes: 60,
          status: 'cancelled',
        },
        {
          staffId: 'staff-a',
          startedAt: '2026-11-10T02:00:00.000Z',
          workedMinutes: 120,
          billableMinutes: 120,
          status: 'approved',
        },
      ],
      weekKeys,
    );
    const billy = rows.find((r) => r.staffId === 'staff-a')!;
    assert.equal(billy.weekApprovedWorkedMinutes, 0);
    assert.equal(billy.weekPendingCount, 0);
  });
});

describe('formatting helpers', () => {
  it('formats compact week cell durations', () => {
    assert.equal(formatWeekCellMinutes(0), '');
    assert.equal(formatWeekCellMinutes(45), '0:45');
    assert.equal(formatWeekCellMinutes(450), '7:30');
  });

  it('formats staff initials', () => {
    assert.equal(staffInitials('Billy Hicks'), 'BH');
    assert.equal(staffInitials('Neil'), 'NE');
    assert.equal(staffInitials('  '), '?');
  });

  it('formats week range labels', () => {
    assert.equal(formatWeekRangeLabel('2026-11-16'), '16 – 22 November 2026');
  });
});

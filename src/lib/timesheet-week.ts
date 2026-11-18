/** Perth week bounds and timesheet staff×day rollups for the HQ timesheets page. */

import { perthDayBounds, perthDayKey } from './perth-day.ts';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type TimesheetWeekEntry = {
  staffId: string;
  startedAt: string;
  workedMinutes: number | null;
  billableMinutes: number | null;
  status: string;
};

export type TimesheetDayCell = {
  dateKey: string;
  approvedWorkedMinutes: number;
  approvedBillableMinutes: number;
  pendingCount: number;
};

export type TimesheetStaffWeekRow = {
  staffId: string;
  fullName: string;
  initials: string;
  days: TimesheetDayCell[];
  weekApprovedWorkedMinutes: number;
  weekApprovedBillableMinutes: number;
  weekPendingCount: number;
};

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const PENDING_HINT = new Set(['submitted', 'corrected']);

/** True when an entry should show as a pending hint on the week grid. */
export function isTimesheetPendingHintStatus(status: string): boolean {
  return PENDING_HINT.has(status);
}

/** Shift a YYYY-MM-DD Perth day key by a whole number of calendar days. */
export function shiftPerthDayKey(dayKey: string, deltaDays: number): string {
  if (!DATE_KEY_RE.test(dayKey)) throw new Error('Invalid Perth day key');
  const base = new Date(dayKey + 'T00:00:00+08:00');
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return perthDayKey(base);
}

/**
 * Monday (inclusive) of the Perth week containing `dayKey`.
 * Weeks are Monday–Sunday in Australia/Perth.
 */
export function perthWeekMonday(dayKey: string): string {
  if (!DATE_KEY_RE.test(dayKey)) throw new Error('Invalid Perth day key');
  // 2024-01-01 was a Monday in Perth; use that as a stable weekday anchor.
  const anchorMonday = new Date('2024-01-01T00:00:00+08:00').getTime();
  const day = new Date(dayKey + 'T00:00:00+08:00').getTime();
  const daysFromAnchor = Math.floor((day - anchorMonday) / (24 * 60 * 60 * 1000));
  const weekdayOffset = ((daysFromAnchor % 7) + 7) % 7; // 0 = Monday … 6 = Sunday
  return shiftPerthDayKey(dayKey, -weekdayOffset);
}

/** Seven Perth date keys Mon–Sun for the week containing `dayKey`. */
export function perthWeekDateKeys(dayKey: string): string[] {
  const monday = perthWeekMonday(dayKey);
  return Array.from({ length: 7 }, (_, i) => shiftPerthDayKey(monday, i));
}

/** Inclusive Monday / exclusive next-Monday UTC bounds for the Perth week. */
export function perthWeekBounds(dayKey: string): { mondayKey: string; start: Date; end: Date } {
  const mondayKey = perthWeekMonday(dayKey);
  const { start } = perthDayBounds(mondayKey);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { mondayKey, start, end };
}

/** Resolve `?week=` (or today) to the Monday key for that Perth week. */
export function resolveTimesheetWeekMonday(weekParam: string | undefined, todayKey: string): string {
  const raw = weekParam && DATE_KEY_RE.test(weekParam) ? weekParam : todayKey;
  return perthWeekMonday(raw);
}

export function staffInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function emptyDayCell(dateKey: string): TimesheetDayCell {
  return {
    dateKey,
    approvedWorkedMinutes: 0,
    approvedBillableMinutes: 0,
    pendingCount: 0,
  };
}

/**
 * Build one grid row per staff member for the given Mon–Sun keys.
 * Approved minutes only count `status === 'approved'`.
 * Pending hint counts `submitted` + `corrected` (not rejected).
 */
export function buildTimesheetWeekRows(
  staff: { id: string; fullName: string }[],
  entries: TimesheetWeekEntry[],
  weekDateKeys: string[],
): TimesheetStaffWeekRow[] {
  const dayIndex = new Map(weekDateKeys.map((key, i) => [key, i]));
  const rows = new Map<string, TimesheetStaffWeekRow>();

  for (const member of staff) {
    rows.set(member.id, {
      staffId: member.id,
      fullName: member.fullName,
      initials: staffInitials(member.fullName),
      days: weekDateKeys.map(emptyDayCell),
      weekApprovedWorkedMinutes: 0,
      weekApprovedBillableMinutes: 0,
      weekPendingCount: 0,
    });
  }

  for (const entry of entries) {
    if (entry.status === 'cancelled') continue;
    const dateKey = perthDayKey(entry.startedAt);
    const index = dayIndex.get(dateKey);
    if (index == null) continue;

    let row = rows.get(entry.staffId);
    if (!row) {
      // Include inactive / unknown staff that still have entries this week.
      row = {
        staffId: entry.staffId,
        fullName: 'Unknown technician',
        initials: '?',
        days: weekDateKeys.map(emptyDayCell),
        weekApprovedWorkedMinutes: 0,
        weekApprovedBillableMinutes: 0,
        weekPendingCount: 0,
      };
      rows.set(entry.staffId, row);
    }

    const cell = row.days[index];
    if (entry.status === 'approved') {
      const worked = Math.max(0, entry.workedMinutes ?? 0);
      const billable = Math.max(0, entry.billableMinutes ?? 0);
      cell.approvedWorkedMinutes += worked;
      cell.approvedBillableMinutes += billable;
      row.weekApprovedWorkedMinutes += worked;
      row.weekApprovedBillableMinutes += billable;
    }
    if (isTimesheetPendingHintStatus(entry.status)) {
      cell.pendingCount += 1;
      row.weekPendingCount += 1;
    }
  }

  return [...rows.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Compact duration for dense week cells (e.g. 7:30, 0:45). Blank when zero. */
export function formatWeekCellMinutes(total: number): string {
  const m = Math.max(0, Math.floor(total));
  if (m <= 0) return '';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}:${String(rem).padStart(2, '0')}`;
}

/** Human week range label, e.g. "16 – 22 November 2026". */
export function formatWeekRangeLabel(mondayKey: string): string {
  const sundayKey = shiftPerthDayKey(mondayKey, 6);
  const start = new Date(mondayKey + 'T12:00:00+08:00');
  const end = new Date(sundayKey + 'T12:00:00+08:00');
  const startDay = start.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    day: 'numeric',
  });
  const endLabel = end.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const startMonth = start.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    month: 'long',
    year: 'numeric',
  });
  const endMonth = end.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    month: 'long',
    year: 'numeric',
  });
  if (startMonth === endMonth) {
    return `${startDay} – ${endLabel}`;
  }
  const startFull = start.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startFull} – ${endLabel}`;
}

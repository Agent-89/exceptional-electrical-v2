import { perthDayBounds, perthDayKey } from './perth-day.ts';

/** Shift a YYYY-MM-DD Perth day key by whole calendar days. */
export function shiftPerthDayKey(dayKey: string, days: number): string {
  const { start } = perthDayBounds(dayKey);
  return perthDayKey(new Date(start.getTime() + days * 86_400_000));
}

/** Sum scheduled visit durations in hours (non-negative; zero if invalid). */
export function sumAppointmentHours(
  appointments: Array<{ starts_at: string; ends_at: string }>,
): number {
  let ms = 0;
  for (const row of appointments) {
    const start = Date.parse(row.starts_at);
    const end = Date.parse(row.ends_at);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    ms += end - start;
  }
  return ms / 3_600_000;
}

export function formatDashboardHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 hrs';
  const rounded = Math.round(hours * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} hr${rounded === 1 ? '' : 's'}`;
}

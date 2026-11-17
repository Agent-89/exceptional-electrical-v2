/** Shared HQ electrician overlap helpers (safe for unit tests; no DB/secrets). */

export const HQ_ELECTRICIAN_OVERLAP_MESSAGE =
  'One of the selected electricians already has an overlapping HQ visit. Choose another time or electrician.';

export type OverlapStaffAssignment = {
  appointment_id: string;
  staff_id: string;
};

export type OverlapVisitSummary = {
  id: string;
  starts_at: string;
  ends_at: string;
  job_number?: number | null;
  job_title?: string | null;
  customer_name?: string | null;
};

export type OverlapConflictLine = {
  staffName: string;
  visitLabel: string;
  timeLabel: string;
};

/**
 * True when any proposed staff id is already booked on an overlapping visit.
 * Callers must exclude the visit being edited from the overlapping appointment set.
 */
export function hasElectricianOverlap(
  staffIds: readonly string[],
  bookedOnOverlaps: readonly OverlapStaffAssignment[],
): boolean {
  if (!staffIds.length || !bookedOnOverlaps.length) return false;
  const wanted = new Set(staffIds);
  return bookedOnOverlaps.some((row) => wanted.has(row.staff_id));
}

export function formatPerthAppointmentWindow(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return 'scheduled time';
  const day = start.toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const startTime = start.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  const endTime = end.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day}, ${startTime} – ${endTime}`;
}

export function buildOverlapConflictLines(args: {
  staffIds: readonly string[];
  staffNames: ReadonlyMap<string, string>;
  bookedOnOverlaps: readonly OverlapStaffAssignment[];
  visits: readonly OverlapVisitSummary[];
  limit?: number;
}): OverlapConflictLine[] {
  const limit = args.limit ?? 6;
  const wanted = new Set(args.staffIds);
  const visits = new Map(args.visits.map((visit) => [visit.id, visit]));
  const lines: OverlapConflictLine[] = [];
  const seen = new Set<string>();

  for (const row of args.bookedOnOverlaps) {
    if (!wanted.has(row.staff_id)) continue;
    const visit = visits.get(row.appointment_id);
    if (!visit) continue;
    const staffName = args.staffNames.get(row.staff_id) || 'Electrician';
    const jobNumber =
      typeof visit.job_number === 'number'
        ? `JB${String(visit.job_number).padStart(5, '0')}`
        : null;
    const visitLabel = [jobNumber, visit.job_title || visit.customer_name || 'HQ visit']
      .filter(Boolean)
      .join(' · ');
    const timeLabel = formatPerthAppointmentWindow(visit.starts_at, visit.ends_at);
    const key = `${row.staff_id}:${visit.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({staffName, visitLabel, timeLabel});
    if (lines.length >= limit) break;
  }
  return lines;
}

/** User-facing HQ overlap copy. Safe for clients — no stack traces or internals. */
export function formatHqElectricianOverlapMessage(lines: readonly OverlapConflictLine[]): string {
  if (!lines.length) return HQ_ELECTRICIAN_OVERLAP_MESSAGE;
  const detail = lines
    .map((line) => `• ${line.staffName} — ${line.visitLabel} (${line.timeLabel})`)
    .join('\n');
  return `Scheduling conflict: an electrician already has an overlapping HQ visit.\n${detail}\nChoose another time or electrician.`;
}

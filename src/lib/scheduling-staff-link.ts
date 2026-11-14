export type SchedulingStaffLink =
  | { ok: true; staffId: string; fullName: string }
  | { ok: false; reason: 'missing' | 'inactive' | 'duplicate' };

/** Pure interpreter for scheduling_staff rows linked to one auth user. */
export function interpretSchedulingStaffRows(
  rows: { id: string; full_name: string; active: boolean }[],
): SchedulingStaffLink {
  if (rows.length === 0) return { ok: false, reason: 'missing' };
  if (rows.length > 1) return { ok: false, reason: 'duplicate' };
  const row = rows[0];
  if (!row.active) return { ok: false, reason: 'inactive' };
  return { ok: true, staffId: row.id, fullName: row.full_name };
}

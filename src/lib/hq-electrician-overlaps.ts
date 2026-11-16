/** Shared HQ electrician overlap helpers (safe for unit tests; no DB/secrets). */

export const HQ_ELECTRICIAN_OVERLAP_MESSAGE =
  'One of the selected electricians already has an overlapping HQ visit. Choose another time or electrician.';

export type OverlapStaffAssignment = {
  appointment_id: string;
  staff_id: string;
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

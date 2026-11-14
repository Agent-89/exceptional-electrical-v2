/** Client-safe duration helpers (no server-only imports). */

export function elapsedWholeMinutes(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

export function computeWorkedMinutes(
  startedAt: string,
  endedAt: string,
  breakMinutes: number,
): number {
  return Math.max(0, elapsedWholeMinutes(startedAt, endedAt) - Math.max(0, breakMinutes));
}

export function formatDurationMinutes(total: number): string {
  const m = Math.max(0, Math.floor(total));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  return `${h}h ${String(rem).padStart(2, '0')}m`;
}

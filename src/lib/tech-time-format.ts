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

/** Live work minutes — same rules as server `liveWorkedMinutes` in tech-time.ts. */
export function displayLiveWorkedMinutes(
  entry: {
    status: string;
    startedAt: string;
    endedAt: string | null;
    breakStartedAt: string | null;
    breakMinutes: number;
    workedMinutes: number | null;
  },
  nowIso = new Date().toISOString(),
): number {
  if (entry.endedAt && entry.workedMinutes != null) return entry.workedMinutes;
  let end = nowIso;
  if (entry.status === 'on_break' && entry.breakStartedAt) {
    end = entry.breakStartedAt;
  }
  return computeWorkedMinutes(entry.startedAt, end, entry.breakMinutes);
}

/** Live break minutes — same rules as server `liveBreakMinutes` in tech-time.ts. */
export function displayLiveBreakMinutes(
  entry: {
    status: string;
    breakStartedAt: string | null;
    breakMinutes: number;
  },
  nowIso = new Date().toISOString(),
): number {
  if (entry.status === 'on_break' && entry.breakStartedAt) {
    return entry.breakMinutes + elapsedWholeMinutes(entry.breakStartedAt, nowIso);
  }
  return entry.breakMinutes;
}

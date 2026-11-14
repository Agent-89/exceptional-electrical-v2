/** Pure layout helpers for hour-by-hour day calendars (office + technician). */

export type TimelineSlot = {
  id: string;
  startMinutes: number;
  endMinutes: number;
};

export type LanePlacement = {
  index: number;
  count: number;
};

/** Minutes since Perth midnight for an ISO instant on a given YYYY-MM-DD day. */
export function perthMinutesOnDay(iso: string, dayKey: string): number {
  const parts = new Date(iso)
    .toLocaleTimeString('en-GB', {
      timeZone: 'Australia/Perth',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
    .split(':')
    .map(Number);
  const minutes = parts[0] * 60 + parts[1];
  // Cross-midnight: if the calendar day of the instant differs, clamp later.
  const instantDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  if (instantDay < dayKey) return 0;
  if (instantDay > dayKey) return 24 * 60;
  return minutes;
}

export function hourLabel(hour: number): string {
  const h = hour % 24;
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Pack overlapping slots into side-by-side lanes so nothing is hidden.
 * Same grouping approach as the office dispatch timeline.
 */
export function layoutOverlappingSlots(slots: TimelineSlot[]): Map<string, LanePlacement> {
  const sorted = [...slots].sort(
    (a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes || a.id.localeCompare(b.id),
  );
  const positions = new Map<string, LanePlacement>();
  let group: TimelineSlot[] = [];
  let groupEnd = -Infinity;

  const flush = () => {
    if (!group.length) return;
    const laneEnds: number[] = [];
    const placed: { slot: TimelineSlot; index: number }[] = [];
    for (const slot of group) {
      let index = laneEnds.findIndex((end) => end <= slot.startMinutes);
      if (index < 0) {
        index = laneEnds.length;
        laneEnds.push(slot.endMinutes);
      } else {
        laneEnds[index] = slot.endMinutes;
      }
      placed.push({ slot, index });
    }
    for (const { slot, index } of placed) {
      positions.set(slot.id, { index, count: laneEnds.length });
    }
  };

  for (const slot of sorted) {
    if (group.length && slot.startMinutes >= groupEnd) {
      flush();
      group = [];
      groupEnd = -Infinity;
    }
    group.push(slot);
    groupEnd = Math.max(groupEnd, slot.endMinutes);
  }
  flush();
  return positions;
}

/** Visible window that keeps short empty stretches small while covering appointments. */
export function computeVisibleWindow(
  appointments: { startMinutes: number; endMinutes: number }[],
  nowMinutes: number | null,
  options?: { padMinutes?: number; minSpanMinutes?: number },
): { startMinutes: number; endMinutes: number } {
  const pad = options?.padMinutes ?? 60;
  const minSpan = options?.minSpanMinutes ?? 8 * 60;
  const dayEnd = 24 * 60;

  if (!appointments.length) {
    const focus = nowMinutes ?? 8 * 60;
    const start = Math.max(0, Math.floor((focus - 90) / 60) * 60);
    const end = Math.min(dayEnd, Math.max(start + minSpan, Math.ceil((focus + 180) / 60) * 60));
    return { startMinutes: start, endMinutes: end };
  }

  const earliest = Math.min(...appointments.map((a) => a.startMinutes));
  const latest = Math.max(...appointments.map((a) => a.endMinutes));
  let start = Math.max(0, Math.floor((earliest - pad) / 60) * 60);
  let end = Math.min(dayEnd, Math.ceil((latest + pad) / 60) * 60);
  if (nowMinutes != null) {
    start = Math.min(start, Math.max(0, Math.floor((nowMinutes - 60) / 60) * 60));
    end = Math.max(end, Math.min(dayEnd, Math.ceil((nowMinutes + 60) / 60) * 60));
  }
  if (end - start < minSpan) {
    const mid = (start + end) / 2;
    start = Math.max(0, Math.floor((mid - minSpan / 2) / 60) * 60);
    end = Math.min(dayEnd, start + minSpan);
    if (end - start < minSpan) start = Math.max(0, end - minSpan);
  }
  return { startMinutes: start, endMinutes: end };
}

export function shiftPerthDayKey(dayKey: string, deltaDays: number): string {
  const base = new Date(dayKey + 'T12:00:00+08:00');
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base);
}

export function formatPerthDayNavLabel(dayKey: string): string {
  return new Date(dayKey + 'T12:00:00+08:00').toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

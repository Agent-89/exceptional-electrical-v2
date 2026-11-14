/** Australia/Perth calendar helpers for technician scheduling views. */

const PERTH = 'Australia/Perth';

/** Calendar date key (YYYY-MM-DD) in Australia/Perth for an instant. */
export function perthDayKey(instant: Date | string = new Date()): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PERTH,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/**
 * Inclusive start / exclusive end UTC bounds for a Perth calendar day.
 * Day key is YYYY-MM-DD interpreted in Australia/Perth (+08, no DST).
 */
export function perthDayBounds(dayKey: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    throw new Error('Invalid Perth day key');
  }
  const start = new Date(dayKey + 'T00:00:00+08:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export function formatPerthTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', {
    timeZone: PERTH,
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPerthDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: PERTH,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatPerthDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: PERTH,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatJobNumber(jobNumber: number): string {
  return 'JB' + String(jobNumber).padStart(5, '0');
}

export function mapsDirectionsUrl(address: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address);
}

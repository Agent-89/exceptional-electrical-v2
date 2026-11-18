/** Pure normalisation helpers for Tradify CSV → HQ mapping keys. */

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeName(value: string): string {
  return collapseWhitespace(value).toLowerCase();
}

export function normalizeAddressPart(value: string): string {
  return collapseWhitespace(value)
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildSiteAddress(parts: {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}): string {
  return [
    parts.street,
    parts.city,
    parts.region,
    parts.postalCode,
    parts.country,
  ]
    .map((p) => collapseWhitespace(p || ''))
    .filter(Boolean)
    .join(', ');
}

export function siteMatchKey(customerName: string, siteName: string, address: string): string {
  return [
    normalizeName(customerName),
    normalizeName(siteName),
    normalizeAddressPart(address),
  ].join('|');
}

/** Extract JB##### job numbers; returns uppercase canonical form. */
export function normalizeJobNumber(raw: string): string | null {
  const m = collapseWhitespace(raw).toUpperCase().match(/\bJB\s*0*(\d+)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return `JB${String(n).padStart(5, '0')}`;
}

export function parseJobNumberInt(canonical: string): number | null {
  const m = canonical.toUpperCase().match(/^JB0*(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/** Split Staff cell into distinct person names (newline / comma / semicolon). */
export function splitStaffNames(raw: string): string[] {
  if (!raw.trim()) return [];
  const parts = raw
    .split(/[\n;]+/)
    .flatMap((chunk) => chunk.split(/,(?![^(]*\))/))
    .map((p) => collapseWhitespace(p))
    .filter(Boolean)
    // Drop schedule-like fragments accidentally mixed into Staff
    .filter((p) => !/\d{4}-\d{2}-\d{2}/.test(p))
    .filter((p) => !/\d{1,2}:\d{2}/.test(p));

  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of parts) {
    const key = normalizeName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Pull staff names from Schedule lines like "Name - 2026-12-03 08:00 to ...". */
export function extractStaffFromSchedule(raw: string): string[] {
  if (!raw.trim()) return [];
  const names: string[] = [];
  for (const line of raw.split(/\n+/)) {
    const trimmed = collapseWhitespace(line);
    if (!trimmed) continue;
    const m = trimmed.match(/^(.+?)\s+-\s+\d{4}-\d{2}-\d{2}/);
    if (m) names.push(collapseWhitespace(m[1]!));
  }
  return splitStaffNames(names.join('\n'));
}

export function mergeStaffNames(...sources: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const source of sources) {
    for (const name of splitStaffNames(source)) {
      const key = normalizeName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
  }
  return out;
}

export type ScheduleWindow = {
  staffName: string;
  startLocal: string; // YYYY-MM-DD HH:mm
  endLocal: string;
  startAt: Date;
  endAt: Date;
  rawLine: string;
};

const SCHEDULE_LINE_RE =
  /^(.+?)\s+-\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*$/i;

/** Parse Tradify naive datetimes as Australia/Perth wall time → UTC Date. */
export function perthLocalToUtc(date: string, time: string): Date | null {
  const dm = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const tm = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!dm || !tm) return null;
  const y = Number(dm[1]);
  const mo = Number(dm[2]);
  const d = Number(dm[3]);
  const h = Number(tm[1]);
  const mi = Number(tm[2]);
  if (![y, mo, d, h, mi].every((n) => Number.isFinite(n))) return null;
  // Perth is UTC+8 year-round (no DST).
  const utcMs = Date.UTC(y, mo - 1, d, h - 8, mi, 0, 0);
  const out = new Date(utcMs);
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * Parse job Schedule cell into visit windows.
 * Lines look like: "Cooper Peberdy - 2026-12-03 08:00 to 2026-12-03 16:00"
 */
export function parseScheduleWindows(raw: string, now: Date = new Date()): ScheduleWindow[] {
  if (!raw.trim()) return [];
  const seen = new Set<string>();
  const out: ScheduleWindow[] = [];
  for (const line of raw.split(/\n+/)) {
    const trimmed = collapseWhitespace(line);
    if (!trimmed) continue;
    const m = trimmed.match(SCHEDULE_LINE_RE);
    if (!m) continue;
    const staffName = collapseWhitespace(m[1]!);
    const startDate = m[2]!;
    const startTime = m[3]!;
    const endDate = m[4]!;
    const endTime = m[5]!;
    const startAt = perthLocalToUtc(startDate, startTime);
    const endAt = perthLocalToUtc(endDate, endTime);
    if (!startAt || !endAt || endAt <= startAt) continue;
    const startLocal = `${startDate} ${startTime.padStart(5, '0')}`;
    const endLocal = `${endDate} ${endTime.padStart(5, '0')}`;
    const dedupe = `${normalizeName(staffName)}|${startAt.toISOString()}|${endAt.toISOString()}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({
      staffName,
      startLocal,
      endLocal,
      startAt,
      endAt,
      rawLine: trimmed,
    });
  }
  // Touch `now` so callers can pass a clock without unused-arg lint if unused here.
  void now;
  return out;
}

export function scheduleHasFutureWindow(raw: string, now: Date = new Date()): boolean {
  return parseScheduleWindows(raw, now).some((w) => w.endAt.getTime() > now.getTime());
}

export type GroupedScheduleVisit = {
  startAt: Date;
  endAt: Date;
  startLocal: string;
  endLocal: string;
  staffNames: string[];
  rawLines: string[];
};

/**
 * Collapse Tradify per-electrician Schedule lines that share the exact same
 * start/end into one HQ visit with multiple crew.
 */
export function groupScheduleWindowsByVisit(
  windows: ScheduleWindow[],
): GroupedScheduleVisit[] {
  const byWindow = new Map<
    string,
    {
      startAt: Date;
      endAt: Date;
      startLocal: string;
      endLocal: string;
      staffNames: string[];
      staffSeen: Set<string>;
      rawLines: string[];
    }
  >();

  for (const w of windows) {
    const key = `${w.startAt.toISOString()}|${w.endAt.toISOString()}`;
    let group = byWindow.get(key);
    if (!group) {
      group = {
        startAt: w.startAt,
        endAt: w.endAt,
        startLocal: w.startLocal,
        endLocal: w.endLocal,
        staffNames: [],
        staffSeen: new Set(),
        rawLines: [],
      };
      byWindow.set(key, group);
    }
    const staffKey = normalizeName(w.staffName);
    if (staffKey && !group.staffSeen.has(staffKey)) {
      group.staffSeen.add(staffKey);
      group.staffNames.push(w.staffName);
    }
    if (w.rawLine && !group.rawLines.includes(w.rawLine)) {
      group.rawLines.push(w.rawLine);
    }
  }

  return [...byWindow.values()]
    .map(({staffSeen: _seen, ...rest}) => rest)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/** Visit-level appointment source key (no staff name). */
export function appointmentSourceKey(
  jobNumber: string,
  startAt: Date,
  endAt: Date,
): string {
  return `${jobNumber}|${startAt.toISOString()}|${endAt.toISOString()}`;
}

export type HqJobStatus =
  | 'unassigned'
  | 'assigned'
  | 'scheduled'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

/**
 * Map Tradify job Status → HQ status.
 * In Progress + future schedule → in_progress; In Progress without → on_hold (review).
 */
export function mapTradifyJobStatus(
  rawStatus: string,
  hasFutureWindow: boolean,
): HqJobStatus {
  const s = collapseWhitespace(rawStatus).toLowerCase();
  if (s === 'in progress') return hasFutureWindow ? 'in_progress' : 'on_hold';
  if (s === 'complete' || s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'scheduled') return 'scheduled';
  if (s === 'assigned') return 'assigned';
  if (s === 'unassigned') return 'unassigned';
  if (s === 'on hold') return 'on_hold';
  return hasFutureWindow ? 'scheduled' : 'on_hold';
}

export type HqQuoteStatus =
  | 'draft'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'cancelled';

export function mapTradifyQuoteStatus(raw: string): HqQuoteStatus {
  const s = collapseWhitespace(raw).toLowerCase();
  if (s === 'accepted') return 'accepted';
  if (s === 'approved') return 'approved';
  if (s === 'draft') return 'draft';
  if (s === 'declined') return 'declined';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'sent') return 'sent';
  return 'draft';
}

export type HqInvoiceStatus = 'draft' | 'approved' | 'sent' | 'part_paid' | 'paid' | 'void';

export function mapTradifyInvoiceStatus(args: {
  deliveryStatus?: string;
  paidCents: number;
  dueCents: number;
  totalCents: number;
}): HqInvoiceStatus {
  const delivery = collapseWhitespace(args.deliveryStatus || '').toLowerCase();
  if (args.totalCents > 0 && args.dueCents <= 0 && args.paidCents > 0) return 'paid';
  if (args.paidCents > 0 && args.dueCents > 0) return 'part_paid';
  if (delivery === 'viewed' || delivery === 'sent') return 'sent';
  if (delivery === 'unsent') return 'approved';
  return 'approved';
}

/** Parse Tradify money strings like "27528.47" or "$1,234.56" → cents. */
export function parseMoneyToCents(raw: string): number {
  const cleaned = collapseWhitespace(raw).replace(/[$,]/g, '');
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Parse "7:00 AM" / "11:00 AM" with a YYYY-MM-DD date → UTC Date (Perth wall). */
export function parseTradifyAmPmToUtc(date: string, timeRaw: string): Date | null {
  const t = collapseWhitespace(timeRaw);
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) {
    // Already 24h HH:mm
    return perthLocalToUtc(date, t);
  }
  let h = Number(m[1]);
  const mi = Number(m[2]);
  const ap = m[3]!.toUpperCase();
  if (ap === 'AM') {
    if (h === 12) h = 0;
  } else if (h !== 12) {
    h += 12;
  }
  return perthLocalToUtc(date, `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
}

export function extractJobNumbersFromCell(raw: string): string[] {
  if (!raw.trim()) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,;]+/)) {
    const jn = normalizeJobNumber(part);
    if (!jn || seen.has(jn)) continue;
    seen.add(jn);
    found.push(jn);
  }
  // Also scan whole cell for JB tokens
  const re = /\bJB\s*0*\d+\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const jn = normalizeJobNumber(m[0]!);
    if (!jn || seen.has(jn)) continue;
    seen.add(jn);
    found.push(jn);
  }
  return found;
}

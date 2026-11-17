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

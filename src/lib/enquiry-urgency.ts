/** Canonical urgency values allowed on `enquiries.urgency`. */
export const ENQUIRY_URGENCY_VALUES = ['low', 'normal', 'high', 'emergency', 'unknown'] as const;
export type EnquiryUrgency = (typeof ENQUIRY_URGENCY_VALUES)[number];

const HIGH_ALIASES = new Set(['urgent', 'priority', 'high']);
const NORMAL_ALIASES = new Set(['routine', 'normal']);

/** Map raw Vapi/message/column tokens onto the DB urgency enum. */
export function normalizeEnquiryUrgency(value: string | null | undefined): EnquiryUrgency {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!raw || raw === 'unknown' || raw === 'unclassified' || raw === 'unspecified') {
    return 'unknown';
  }
  if (HIGH_ALIASES.has(raw)) return 'high';
  if (NORMAL_ALIASES.has(raw)) return 'normal';
  if (raw === 'emergency') return 'emergency';
  if (raw === 'low') return 'low';
  return 'unknown';
}

/**
 * Resolve display urgency: treat column `unknown`/empty as missing and fall back
 * to a message metadata value (e.g. `Urgency: urgent`).
 */
export function resolveEnquiryUrgency(
  column: string | null | undefined,
  messageValue?: string | null | undefined,
): EnquiryUrgency {
  const fromColumn = normalizeEnquiryUrgency(column);
  if (fromColumn !== 'unknown') return fromColumn;
  return normalizeEnquiryUrgency(messageValue);
}

export function isUrgentEnquiryUrgency(value: EnquiryUrgency): boolean {
  return value === 'high' || value === 'emergency';
}

export function enquiryUrgencyLabel(value: EnquiryUrgency): string {
  if (value === 'unknown') return 'Unknown';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

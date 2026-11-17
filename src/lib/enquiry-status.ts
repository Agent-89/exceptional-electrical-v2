/** Enquiry workflow statuses staff can set in HQ. Quote lifecycle owns the rest. */
export const ENQUIRY_STATUSES = ['new', 'contacted', 'closed', 'spam'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

const LEGACY_TO_CURRENT: Record<string, EnquiryStatus> = {
  qualified: 'contacted',
  scheduled: 'contacted',
};

export function isEnquiryStatus(value: string): value is EnquiryStatus {
  return (ENQUIRY_STATUSES as readonly string[]).includes(value);
}

/** Map legacy qualified/scheduled rows onto the simplified set for display/editing. */
export function normalizeEnquiryStatus(value: string | null | undefined): EnquiryStatus {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  if (isEnquiryStatus(raw)) return raw;
  return LEGACY_TO_CURRENT[raw] ?? 'new';
}

export function enquiryStatusLabel(value: string | null | undefined): string {
  const status = normalizeEnquiryStatus(value);
  return status.charAt(0).toUpperCase() + status.slice(1);
}

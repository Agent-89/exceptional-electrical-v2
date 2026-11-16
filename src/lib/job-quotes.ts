/** Pure helpers for job ↔ quote associations (Milestone C1). */

export const JOB_QUOTE_KINDS = ['quote', 'variation', 'additional_works'] as const;
export type JobQuoteKind = (typeof JOB_QUOTE_KINDS)[number];

export type JobQuoteAssociationInput = {
  quoteId: string;
  isPrimary: boolean;
  associationKind: JobQuoteKind;
  label: string | null;
  linkedAt?: string | null;
  source: 'job_quotes' | 'legacy_quote_id';
};

export type JobQuoteDisplay = JobQuoteAssociationInput & {
  id: string;
  quoteNumber: string;
  title: string;
  status: string;
  updatedAt: string;
  totalCentsIncGst: number;
};

export type QuoteLineForTotal = {
  description?: string | null;
  category?: string | null;
  quantity: number | string;
  unit_price_cents: number | string;
  gst_applicable?: boolean | null;
};

export function isJobQuoteKind(value: string): value is JobQuoteKind {
  return (JOB_QUOTE_KINDS as readonly string[]).includes(value);
}

/** Legacy pairwise check: both missing is treated as compatible for display helpers. */
export function quoteCustomersCompatible(
  jobCustomerId: string | null | undefined,
  quoteCustomerId: string | null | undefined,
): boolean {
  if (!jobCustomerId || !quoteCustomerId) return jobCustomerId === quoteCustomerId;
  return jobCustomerId === quoteCustomerId;
}

/** Server-side gate for linking: job must have a customer and the quote must match it. */
export function canLinkQuoteToJob(
  jobCustomerId: string | null | undefined,
  quoteCustomerId: string | null | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!jobCustomerId) {
    return { ok: false, message: jobCustomerRequiredErrorMessage() };
  }
  if (!quoteCustomerId) {
    return { ok: false, message: quoteCustomerRequiredErrorMessage() };
  }
  if (jobCustomerId !== quoteCustomerId) {
    return { ok: false, message: crossCustomerErrorMessage() };
  }
  return { ok: true };
}

/** Inc-GST total; respects fixed-price mode filter used on the quotes register. */
export function quoteTotalIncGstCents(
  items: QuoteLineForTotal[] | null | undefined,
  pricingMode: string | null | undefined = 'detailed',
): number {
  if (!items?.length) return 0;
  const mode = pricingMode || 'detailed';
  const filtered = items.filter((line) => {
    const isFixedMarker =
      line.category === 'other' && line.description === 'Fixed-price electrical work';
    return mode === 'fixed' ? isFixedMarker : !isFixedMarker;
  });
  return filtered.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const unit = Number(item.unit_price_cents) || 0;
    const ex = Math.round(qty * unit);
    const gst = item.gst_applicable === false ? 0 : Math.round(ex * 0.1);
    return sum + ex + gst;
  }, 0);
}

export function formatAudFromCents(cents: number): string {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export function associationKindLabel(kind: JobQuoteKind): string {
  if (kind === 'variation') return 'Variation';
  if (kind === 'additional_works') return 'Additional works';
  return 'Quote';
}

/**
 * Merge join-table rows with legacy jobs.quote_id.
 * Dedupes by quote id so a primary present in both places is counted once.
 * Prefer join-table metadata when both exist.
 */
export function mergeJobQuoteAssociations(args: {
  legacyPrimaryQuoteId: string | null | undefined;
  associations: JobQuoteAssociationInput[];
}): JobQuoteAssociationInput[] {
  const byId = new Map<string, JobQuoteAssociationInput>();

  for (const row of args.associations) {
    byId.set(row.quoteId, row);
  }

  const legacy = (args.legacyPrimaryQuoteId || '').trim();
  if (legacy && !byId.has(legacy)) {
    byId.set(legacy, {
      quoteId: legacy,
      isPrimary: true,
      associationKind: 'quote',
      label: null,
      source: 'legacy_quote_id',
    });
  } else if (legacy && byId.has(legacy)) {
    const existing = byId.get(legacy)!;
    if (!args.associations.some((a) => a.isPrimary)) {
      byId.set(legacy, { ...existing, isPrimary: true });
    }
  }

  const rows = [...byId.values()];
  rows.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    const aAt = a.linkedAt || '';
    const bAt = b.linkedAt || '';
    return aAt.localeCompare(bAt);
  });
  return rows;
}

/** After unlink/set-primary decisions: which quote_id should jobs.quote_id hold. */
export function nextPrimaryQuoteId(
  remaining: { quoteId: string; isPrimary: boolean }[],
): string | null {
  const primary = remaining.find((r) => r.isPrimary);
  return primary?.quoteId ?? null;
}

export function duplicateAssociationErrorMessage(): string {
  return 'That quote is already linked to this job.';
}

export function crossCustomerErrorMessage(): string {
  return 'Quotes must belong to the same customer as the job.';
}

export function jobCustomerRequiredErrorMessage(): string {
  return 'Add a customer to this job before linking a quote.';
}

export function quoteCustomerRequiredErrorMessage(): string {
  return 'Choose a quote that belongs to this job’s customer.';
}

export function concurrentPrimaryChangeErrorMessage(): string {
  return 'Another primary quote change happened at the same time. Refresh and try again.';
}

/** Browser confirm copy for unlinking. Does not delete the quote record. */
export function unlinkQuoteConfirmMessage(args: {
  quoteNumber: string;
  isPrimary: boolean;
}): string {
  const label = args.quoteNumber.trim() || 'this quote';
  const base =
    `Unlink ${label} from this job?\n\n` +
    'This only removes the job association. The quote and its history stay in Quotes.';
  if (!args.isPrimary) return base;
  return (
    base +
    '\n\nThis is the primary quote. After unlinking, the job will have no primary quote until you select another.'
  );
}

export type JobQuoteAtomicResult = {
  ok: boolean;
  message?: string;
  isPrimary?: boolean;
  clearedPrimary?: boolean;
};

export function interpretJobQuoteAtomicResult(
  data: unknown,
  fallbackError: string,
): JobQuoteAtomicResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: fallbackError };
  }
  const row = data as Record<string, unknown>;
  const ok = row.ok === true;
  const message =
    typeof row.message === 'string' && row.message.trim()
      ? row.message
      : ok
        ? undefined
        : fallbackError;
  return {
    ok,
    message,
    isPrimary: row.isPrimary === true,
    clearedPrimary: row.clearedPrimary === true,
  };
}

/**
 * Decide primary flags when linking.
 * - makePrimary: this quote becomes the only primary
 * - else if no existing primary: new link becomes primary
 * - else: additional (not primary)
 */
export function resolvePrimaryOnLink(args: {
  makePrimary: boolean;
  existing: { quoteId: string; isPrimary: boolean }[];
  quoteId: string;
}): { quoteIsPrimary: boolean; demoteQuoteIds: string[] } {
  const hasPrimary = args.existing.some((r) => r.isPrimary);
  if (args.makePrimary) {
    return {
      quoteIsPrimary: true,
      demoteQuoteIds: args.existing.filter((r) => r.isPrimary && r.quoteId !== args.quoteId).map((r) => r.quoteId),
    };
  }
  if (!hasPrimary) {
    return { quoteIsPrimary: true, demoteQuoteIds: [] };
  }
  return { quoteIsPrimary: false, demoteQuoteIds: [] };
}

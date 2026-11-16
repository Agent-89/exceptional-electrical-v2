/** C1.1: commercial current version vs job primary (separate concepts). */

export const QUOTE_COMMERCIAL_STATUSES = ['approved', 'sent', 'accepted'] as const;
export type QuoteCommercialStatus = (typeof QUOTE_COMMERCIAL_STATUSES)[number];

export function isQuoteCommercialStatus(status: string): status is QuoteCommercialStatus {
  return (QUOTE_COMMERCIAL_STATUSES as readonly string[]).includes(status);
}

/** Statuses that can be superseded when another accepted quote becomes commercial current. */
export function canBeSupersededByCurrentTransition(status: string): boolean {
  return isQuoteCommercialStatus(status);
}

export function quoteTypeFromParent(parentQuoteId: string | null | undefined): 'standard' | 'variation' {
  return parentQuoteId ? 'variation' : 'standard';
}

export function nextRevisionNumber(parentRevision: number | null | undefined): number {
  const base = Number.isFinite(parentRevision) ? Number(parentRevision) : 0;
  return Math.max(0, base) + 1;
}

export function sameCustomerRequiredMessage(): string {
  return 'Variation parent must belong to the same customer.';
}

export function parentRequiredForVariationMessage(): string {
  return 'Select the quote this variation revises.';
}

export function incompatibleJobMessage(): string {
  return 'Parent quote and variation must relate to the same job when a job context is set.';
}

export function billingBlocksSupersessionMessage(): string {
  return 'Automatic supersession is blocked because existing billing cannot be safely reconciled. Office review is required.';
}

export function concurrentCurrentTransitionMessage(): string {
  return 'Another current-version change happened at the same time. Refresh and try again.';
}

export function onlyAcceptedCanBeCurrentMessage(): string {
  return 'Only accepted quotes can be the current commercial version. Draft, approved and sent quotes are not commercial current.';
}

/**
 * Backfill / eligibility: commercial current is the accepted commercial version only.
 * A family may have no current member.
 */
export function isEligibleCommercialCurrentStatus(status: string): boolean {
  return status === 'accepted';
}

export function pickCommercialCurrentBackfillId(
  family: { id: string; status: string; acceptedAt?: string | null; createdAt?: string }[],
): string | null {
  const accepted = family
    .filter((q) => isEligibleCommercialCurrentStatus(q.status))
    .sort((a, b) => {
      const aAt = a.acceptedAt || a.createdAt || '';
      const bAt = b.acceptedAt || b.createdAt || '';
      return bAt.localeCompare(aAt) || b.id.localeCompare(a.id);
    });
  return accepted[0]?.id ?? null;
}

/**
 * Costing prep only — never sum superseded + replacement totals.
 * C2 owns billing reconciliation; do not treat this flag as invoice authority.
 */
export function resolveCommercialCurrentQuoteId(
  family: { id: string; isCommercialCurrent: boolean; status: string }[],
): string | null {
  const current = family.find(
    (q) => q.isCommercialCurrent && q.status === 'accepted',
  );
  return current?.id ?? null;
}

/** Prep helper for invoices: take the current accepted member's total only. */
export function resolveCommercialCurrentTotalCents(
  family: { id: string; isCommercialCurrent: boolean; status: string; totalCents: number }[],
): number {
  const id = resolveCommercialCurrentQuoteId(family);
  if (!id) return 0;
  return family.find((q) => q.id === id)?.totalCents ?? 0;
}

/** Revisions auto-make-current inside accept_quote_atomic; standards also become current on accept. */
export function shouldAutoMakeCurrentOnAccept(args: {
  parentQuoteId: string | null | undefined;
  statusBeforeAccept: string;
}): boolean {
  return args.statusBeforeAccept === 'approved' || args.statusBeforeAccept === 'sent';
}

export type QuoteSaveIntent = 'continue' | 'return_to_job';

export function quoteEditorReturnHref(args: {
  jobId: string | null | undefined;
  intent: QuoteSaveIntent;
  quoteId?: string | null;
}): string | null {
  if (args.intent !== 'return_to_job' || !args.jobId) return null;
  const base = `/hq/jobs/${args.jobId}?tab=quotes`;
  return args.quoteId ? `${base}&notice=${encodeURIComponent('Quote saved and linked.')}` : base;
}

export function quoteBuilderNewHref(args: {
  jobId?: string | null;
  parentQuoteId?: string | null;
  type?: 'standard' | 'variation';
}): string {
  const params = new URLSearchParams();
  if (args.jobId) params.set('job', args.jobId);
  if (args.type === 'variation' || args.parentQuoteId) params.set('type', 'variation');
  if (args.parentQuoteId) params.set('parent', args.parentQuoteId);
  if (args.jobId) params.set('returnTo', 'job');
  const qs = params.toString();
  return qs ? `/hq/quotes/new?${qs}` : '/hq/quotes/new';
}

/** Parent must share the job context when already linked elsewhere. */
export function variationParentJobCompatible(args: {
  jobId: string | null | undefined;
  parentLinkedJobIds: string[];
}): { ok: true } | { ok: false; message: string } {
  const jobId = args.jobId?.trim() || '';
  if (!jobId) return { ok: true };
  if (!args.parentLinkedJobIds.length) return { ok: true };
  if (args.parentLinkedJobIds.includes(jobId)) return { ok: true };
  return { ok: false, message: incompatibleJobMessage() };
}

export function validateVariationParentSelection(args: {
  quoteType: 'standard' | 'variation';
  parentQuoteId: string | null | undefined;
  customerId: string | null | undefined;
  parentCustomerId: string | null | undefined;
}): { ok: true } | { ok: false; message: string } {
  if (args.quoteType !== 'variation') return { ok: true };
  if (!args.parentQuoteId) return { ok: false, message: parentRequiredForVariationMessage() };
  if (!args.customerId || !args.parentCustomerId || args.customerId !== args.parentCustomerId) {
    return { ok: false, message: sameCustomerRequiredMessage() };
  }
  return { ok: true };
}

export function interpretMakeCurrentResult(
  data: unknown,
  fallback = 'Unable to update commercial current version.',
): { ok: boolean; message: string; quoteId?: string; requiresReview?: boolean; madeCommercialCurrent?: boolean } {
  if (!data || typeof data !== 'object') return { ok: false, message: fallback };
  const row = data as Record<string, unknown>;
  const ok = row.ok === true;
  const message = typeof row.message === 'string' && row.message ? row.message : fallback;
  const quoteId = typeof row.quoteId === 'string' ? row.quoteId : undefined;
  const requiresReview = row.requiresReview === true;
  const madeCommercialCurrent = row.madeCommercialCurrent === true;
  return { ok, message, quoteId, requiresReview, madeCommercialCurrent };
}

export function isMissingCommercialSchemaError(error: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    error.code === 'PGRST202' ||
    /commercial_family_id|is_commercial_current|make_quote_commercial_current_atomic|accept_quote_atomic/i.test(
      message,
    ) ||
    /could not find the function/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
}

export function commercialSchemaMissingMessage(): string {
  return 'Quote variations need the commercial-current migration. Apply it locally before using this feature.';
}

/** Primary badge vs commercial current are independent labels. */
export function commercialCurrentLabel(isCommercialCurrent: boolean): string | null {
  return isCommercialCurrent ? 'Current commercial' : null;
}

/**
 * C1.1 does not establish whether historical invoices or payments exist outside HQ.
 * Do not auto-drive invoicing from is_commercial_current; full reconciliation is C2.
 */
export function billingReconciliationDeferredMessage(): string {
  return 'C1.1 does not reconcile invoices or payments outside HQ. Billing decisions belong to C2.';
}

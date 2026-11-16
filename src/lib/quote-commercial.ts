/** C1.1: commercial current version vs job primary (separate concepts). */

export const QUOTE_COMMERCIAL_STATUSES = ['approved', 'sent', 'accepted'] as const;
export type QuoteCommercialStatus = (typeof QUOTE_COMMERCIAL_STATUSES)[number];

/** Statuses that may be selected as a variation parent. */
export const VARIATION_PARENT_ELIGIBLE_STATUSES = [
  'draft',
  'changes_requested',
  'pending_approval',
  'approved',
  'sent',
  'accepted',
] as const;

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

export function resolveCommercialCurrentQuoteId(
  family: { id: string; isCommercialCurrent: boolean; status: string }[],
): string | null {
  const current = family.find((q) => q.isCommercialCurrent && q.status === 'accepted');
  return current?.id ?? null;
}

export function resolveCommercialCurrentTotalCents(
  family: { id: string; isCommercialCurrent: boolean; status: string; totalCents: number }[],
): number {
  const id = resolveCommercialCurrentQuoteId(family);
  if (!id) return 0;
  return family.find((q) => q.id === id)?.totalCents ?? 0;
}

export function shouldAutoMakeCurrentOnAccept(args: {
  parentQuoteId: string | null | undefined;
  statusBeforeAccept: string;
}): boolean {
  return args.statusBeforeAccept === 'approved' || args.statusBeforeAccept === 'sent';
}

export type QuoteSaveIntent = 'continue' | 'return_to_job' | 'return_to_quotes';

export function quoteEditorReturnHref(args: {
  jobId: string | null | undefined;
  intent: QuoteSaveIntent;
  quoteId?: string | null;
}): string | null {
  if (args.intent === 'return_to_quotes') {
    return args.quoteId ? `/hq/quotes/${args.quoteId}` : '/hq/quotes';
  }
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

/** Legacy helper: job-scoped parent check (optional). Parent may be any same-customer quote. */
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

export function isEligibleVariationParentStatus(status: string): boolean {
  return (VARIATION_PARENT_ELIGIBLE_STATUSES as readonly string[]).includes(status);
}

/** Exclude self, cancelled/superseded/declined/expired, and circular ancestors. */
export function isValidVariationParentCandidate(args: {
  candidateId: string;
  candidateStatus: string;
  candidateCustomerId: string | null | undefined;
  quoteCustomerId: string | null | undefined;
  editingQuoteId?: string | null;
  /** Ancestor chain of the editing quote (parent → root). */
  editingAncestorIds?: string[];
}): boolean {
  if (!args.candidateId) return false;
  if (args.editingQuoteId && args.candidateId === args.editingQuoteId) return false;
  if (args.editingAncestorIds?.includes(args.candidateId)) return false;
  if (!isEligibleVariationParentStatus(args.candidateStatus)) return false;
  if (!args.quoteCustomerId || !args.candidateCustomerId) return false;
  if (args.quoteCustomerId !== args.candidateCustomerId) return false;
  return true;
}

export type ParentQuoteOption = {
  id: string;
  quoteNumber: string;
  title: string | null;
  status: string;
  revisionNumber?: number | null;
  parentQuoteNumber?: string | null;
  linkedJobs: { id: string; jobNumber: string | null; title: string | null }[];
};

export type ParentQuoteGroup = {
  key: string;
  label: string;
  quotes: ParentQuoteOption[];
};

/** Group by first linked job; quotes with multiple jobs appear once under primary listing job or Unlinked. */
export function groupParentQuotesByJob(options: ParentQuoteOption[]): ParentQuoteGroup[] {
  const byJob = new Map<string, ParentQuoteGroup>();
  const unlinked: ParentQuoteOption[] = [];
  const seen = new Set<string>();

  for (const option of options) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    if (!option.linkedJobs.length) {
      unlinked.push(option);
      continue;
    }
    const job = option.linkedJobs[0];
    const key = job.id;
    const existing = byJob.get(key);
    if (existing) existing.quotes.push(option);
    else {
      byJob.set(key, {
        key,
        label: `${job.jobNumber || 'Job'} · ${job.title || 'Untitled job'}`,
        quotes: [option],
      });
    }
  }

  const groups = [...byJob.values()].sort((a, b) => a.label.localeCompare(b.label));
  if (unlinked.length) {
    groups.push({ key: 'unlinked', label: 'Unlinked quotes', quotes: unlinked });
  }
  return groups;
}

export type PrefillLine = {
  description: string;
  category: string;
  quantity: number;
  unit: string;
  price: number;
  cost: number | null;
  gst: boolean;
};

export type PrefillCommercialContent = {
  title: string;
  scope: string;
  inclusions: string;
  exclusions: string;
  notes: string;
  internalNotes: string;
  display: string;
  mode: string;
  address: string;
  addressId: string;
  lines: PrefillLine[];
};

export function variationTitleFromParent(parentTitle: string | null | undefined): string {
  const base = String(parentTitle || 'Electrical work').trim() || 'Electrical work';
  if (/^variation\b/i.test(base)) return base.slice(0, 200);
  return `Variation — ${base}`.slice(0, 200);
}

/** Deep-copy commercial fields from an immediate parent (not root). Does not copy ids/status/current. */
export function buildVariationPrefillFromParent(parent: {
  title?: string | null;
  scope?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
  display?: string | null;
  mode?: string | null;
  address?: string | null;
  addressId?: string | null;
  lines?: PrefillLine[] | null;
}): PrefillCommercialContent {
  const mode = parent.mode || 'detailed';
  const lines = (parent.lines || []).map((line) => ({
    description: line.description,
    category: line.category,
    quantity: Number(line.quantity) || 0,
    unit: line.unit || 'each',
    price: Number(line.price) || 0,
    cost: line.cost === null || line.cost === undefined ? null : Number(line.cost),
    gst: Boolean(line.gst),
  }));
  return {
    title: variationTitleFromParent(parent.title),
    scope: String(parent.scope || ''),
    inclusions: String(parent.inclusions || ''),
    exclusions: String(parent.exclusions || ''),
    notes: String(parent.notes || ''),
    internalNotes: String(parent.internalNotes || ''),
    display: parent.display === 'total_only' ? 'total_only' : 'itemised',
    mode: ['fixed', 'detailed', 'mixed'].includes(mode) ? mode : 'detailed',
    address: String(parent.address || ''),
    addressId: String(parent.addressId || ''),
    lines,
  };
}

export function draftHasUnsavedCommercialContent(draft: {
  title?: string;
  scope?: string;
  inclusions?: string;
  exclusions?: string;
  notes?: string;
  internalNotes?: string;
  lines?: PrefillLine[];
}): boolean {
  if ((draft.title || '').trim()) return true;
  if ((draft.scope || '').trim()) return true;
  if ((draft.inclusions || '').trim()) return true;
  if ((draft.exclusions || '').trim()) return true;
  if ((draft.notes || '').trim()) return true;
  if ((draft.internalNotes || '').trim()) return true;
  return (draft.lines || []).some((line) => (line.description || '').trim() || Number(line.price) > 0);
}

export function parentSwitchConfirmMessage(): string {
  return 'Replace the current quote content with a copy of the newly selected parent? Your unsaved edits will be lost.';
}

export function uniqueJobIds(ids: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const value = (id || '').trim();
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

export function interpretMakeCurrentResult(
  data: unknown,
  fallback = 'Unable to update commercial current version.',
): {
  ok: boolean;
  message: string;
  quoteId?: string;
  requiresReview?: boolean;
  madeCommercialCurrent?: boolean;
} {
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

export function commercialCurrentLabel(isCommercialCurrent: boolean): string | null {
  return isCommercialCurrent ? 'Current commercial' : null;
}

export function billingReconciliationDeferredMessage(): string {
  return 'C1.1 does not reconcile invoices or payments outside HQ. Billing decisions belong to C2.';
}

export function quoteBuilderHeading(args: {
  savedNumber?: string | null;
  quoteType: 'standard' | 'variation';
}): string {
  if (args.savedNumber) return args.savedNumber;
  return args.quoteType === 'variation' ? 'New Variation' : 'New Quote';
}

export function isDuplicateAssociationMessage(message: string | null | undefined): boolean {
  return /already linked/i.test(message || '');
}

export function partialJobLinkFailureMessage(args: {
  savedQuoteId: string;
  failedMessages: string[];
  linkedCount: number;
  requestedCount: number;
}): string {
  const detail = args.failedMessages[0] || 'One or more job associations failed.';
  return (
    `Quote saved (${args.savedQuoteId.slice(0, 8)}…), but job linking was incomplete ` +
    `(${args.linkedCount}/${args.requestedCount}). ${detail} Review Linked jobs before approving.`
  );
}

export function atomicSaveLinkUnavailableMessage(): string {
  return 'Quote save-and-link needs the multi-job atomic migration. Apply it locally before relying on multi-job saves.';
}

/** True only when save succeeded and every requested association succeeded (or none requested). */
export function canProceedToApproveAfterSave(args: {
  saveOk: boolean;
  linkStatus: 'none' | 'complete' | 'partial' | 'failed' | 'rolled_back';
}): boolean {
  if (!args.saveOk) return false;
  return args.linkStatus === 'none' || args.linkStatus === 'complete';
}

export function interpretSaveDraftAndLinkResult(
  data: unknown,
  fallback = 'Unable to save quote and link jobs.',
): {
  ok: boolean;
  message: string;
  quoteId?: string;
  linkedJobIds: string[];
  duplicateCount: number;
} {
  if (!data || typeof data !== 'object') {
    return { ok: false, message: fallback, linkedJobIds: [], duplicateCount: 0 };
  }
  const row = data as Record<string, unknown>;
  const ok = row.ok === true;
  const message = typeof row.message === 'string' && row.message ? row.message : fallback;
  const quoteId = typeof row.quoteId === 'string' ? row.quoteId : undefined;
  const linkedRaw = row.linkedJobIds;
  const linkedJobIds = Array.isArray(linkedRaw)
    ? linkedRaw.map((id) => String(id)).filter(Boolean)
    : [];
  const duplicateCount = Number(row.duplicateCount) || 0;
  return { ok, message, quoteId, linkedJobIds, duplicateCount };
}

export function isMissingSaveAndLinkJobsRpcError(error: {
  message?: string;
  code?: string;
} | null): boolean {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === 'PGRST202' ||
    /save_quote_draft_and_link_jobs_atomic/i.test(message) ||
    /could not find the function/i.test(message)
  );
}

/** Detect cycles or self-reference in a parent → root chain (max depth). */
export function parentChainIntroducesCycle(args: {
  parentId: string;
  editingQuoteId?: string | null;
  /** Ordered ancestor ids of the selected parent (parent, grandparent, …). */
  parentAncestorIds: string[];
  /** True when the walk stopped because max depth was reached with more parents remaining. */
  chainExceedsMaxDepth?: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (args.chainExceedsMaxDepth) {
    return { ok: false, message: parentRevisionChainTooDeepMessage() };
  }
  if (args.editingQuoteId && args.parentId === args.editingQuoteId) {
    return { ok: false, message: 'A quote cannot revise itself.' };
  }
  if (args.editingQuoteId && args.parentAncestorIds.includes(args.editingQuoteId)) {
    return { ok: false, message: 'That parent would create a circular revision relationship.' };
  }
  const seen = new Set<string>([args.parentId]);
  for (const id of args.parentAncestorIds) {
    if (seen.has(id)) {
      return { ok: false, message: 'That parent has a circular revision chain and cannot be used.' };
    }
    seen.add(id);
  }
  return { ok: true };
}

export function parentRevisionChainTooDeepMessage(): string {
  return 'Revision chain is too deep to validate safely. Choose a closer parent quote.';
}

export const QUOTE_PARENT_ANCESTOR_MAX_DEPTH = 20;

export function quoteCustomerChangeBlockedMessage(): string {
  return 'Unlink all jobs from this quote before changing the customer. Existing job associations (including legacy primary links) must be removed first.';
}

/**
 * Persisted quotes with any job association (join table or legacy primary) cannot change customer.
 * Unsaved quotes may change freely.
 */
export function canChangePersistedQuoteCustomer(args: {
  quoteIsPersisted: boolean;
  previousCustomerId: string | null | undefined;
  nextCustomerId: string | null | undefined;
  associatedJobCount: number;
}): { ok: true } | { ok: false; message: string } {
  if (!args.quoteIsPersisted) return { ok: true };
  const prev = (args.previousCustomerId || '').trim();
  const next = (args.nextCustomerId || '').trim();
  if (!next || prev === next) return { ok: true };
  if (args.associatedJobCount > 0) {
    return { ok: false, message: quoteCustomerChangeBlockedMessage() };
  }
  return { ok: true };
}

/** Clear pending/local job ids when the draft customer changes. */
export function reconcileLinkedJobsForCustomerChange(args: {
  previousCustomerId: string;
  nextCustomerId: string;
  linkedJobIds: string[];
}): string[] {
  if (!args.nextCustomerId || args.previousCustomerId === args.nextCustomerId) {
    return uniqueJobIds(args.linkedJobIds);
  }
  return [];
}

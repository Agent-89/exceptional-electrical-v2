'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertOfficeOps, dbAdmin, requireHqUser } from '@/lib/hq-auth';
import {
  canLinkQuoteToJob,
  classifyPrimarySyncOutcome,
  interpretJobQuoteAtomicResult,
  isJobQuoteKind,
  orphanDraftRecoveryMessage,
  type JobQuoteKind,
  type PrimarySyncOutcome,
} from '@/lib/job-quotes';
import { isMissingJobQuotesRelation } from '@/lib/job-quotes-store';
import { jobDetailTabHref } from '@/lib/job-detail-tabs';

const uuid = /^[0-9a-f-]{36}$/i;

function quotesTab(jobId: string, notice?: string, error?: string): string {
  const base = jobDetailTabHref(jobId, 'quotes');
  const params = new URLSearchParams();
  if (notice) params.set('notice', notice);
  if (error) params.set('error', error);
  const qs = params.toString();
  return qs ? `${base}${base.includes('?') ? '&' : '?'}${qs}` : base;
}

function revalidateJobQuotes(jobId: string) {
  revalidatePath('/hq/jobs');
  revalidatePath(`/hq/jobs/${jobId}`);
  revalidatePath('/hq/quotes');
}

function isRedirectError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'digest' in error;
}

async function requireJobQuotesTable() {
  const db = dbAdmin();
  const { error } = await db.from('job_quotes').select('id').limit(1);
  if (error && isMissingJobQuotesRelation(error)) {
    throw new Error(
      'Multi-quote linking is not available until the job_quotes migration is applied.',
    );
  }
  if (error) throw new Error('Unable to access quote associations.');
  return db;
}

function missingAtomicRpc(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === 'PGRST202' ||
    /job_quote_link_atomic|job_quote_unlink_atomic|job_quote_set_primary_atomic|job_quote_sync_primary_after_create_atomic|job_quote_create_and_link_atomic/i.test(
      message,
    ) ||
    /could not find the function/i.test(message)
  );
}

export async function linkQuoteToJob(formData: FormData): Promise<void> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  const jobId = String(formData.get('job_id') || '').trim();
  const quoteId = String(formData.get('quote_id') || '').trim();
  const kindRaw = String(formData.get('association_kind') || 'quote').trim();
  const labelRaw = String(formData.get('label') || '').trim();
  const makePrimary = formData.get('make_primary') === 'yes';

  try {
    if (!uuid.test(jobId) || !uuid.test(quoteId)) throw new Error('Invalid job or quote reference.');
    if (!isJobQuoteKind(kindRaw)) throw new Error('Invalid association type.');
    if (labelRaw.length > 80) throw new Error('Label is too long.');

    const db = await requireJobQuotesTable();
    const { data: job } = await db
      .from('jobs')
      .select('id,customer_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new Error('Job not found.');

    const { data: quote } = await db
      .from('quotes')
      .select('id,customer_id')
      .eq('id', quoteId)
      .maybeSingle();
    if (!quote) throw new Error('Quote not found.');

    const compatibility = canLinkQuoteToJob(job.customer_id, quote.customer_id);
    if (!compatibility.ok) throw new Error(compatibility.message);

    const { data, error } = await db.rpc('job_quote_link_atomic', {
      p_job_id: jobId,
      p_quote_id: quoteId,
      p_actor: user.id,
      p_association_kind: kindRaw as JobQuoteKind,
      p_label: labelRaw || null,
      p_make_primary: makePrimary,
    });
    if (missingAtomicRpc(error)) {
      throw new Error(
        'Quote linking needs the job_quotes atomic migration. Refresh after it is applied.',
      );
    }
    const result = interpretJobQuoteAtomicResult(data, 'Unable to link quote.');
    if (error || !result.ok) throw new Error(result.message || error?.message || 'Unable to link quote.');

    revalidateJobQuotes(jobId);
    redirect(quotesTab(jobId, result.message || 'Quote linked.'));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : 'Unable to link quote.';
    if (!uuid.test(jobId)) throw new Error(message);
    redirect(quotesTab(jobId, undefined, message));
  }
}

export async function unlinkQuoteFromJob(formData: FormData): Promise<void> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  const jobId = String(formData.get('job_id') || '').trim();
  const quoteId = String(formData.get('quote_id') || '').trim();
  const confirmed = String(formData.get('confirm_unlink') || '') === 'yes';

  try {
    if (!uuid.test(jobId) || !uuid.test(quoteId)) throw new Error('Invalid job or quote reference.');
    if (!confirmed) throw new Error('Unlink cancelled. Confirm to remove the association only.');

    const db = await requireJobQuotesTable();
    const { data, error } = await db.rpc('job_quote_unlink_atomic', {
      p_job_id: jobId,
      p_quote_id: quoteId,
      p_actor: user.id,
    });
    if (missingAtomicRpc(error)) {
      throw new Error(
        'Quote unlinking needs the job_quotes atomic migration. Refresh after it is applied.',
      );
    }
    const result = interpretJobQuoteAtomicResult(data, 'Unable to unlink quote.');
    if (error || !result.ok) {
      throw new Error(result.message || error?.message || 'Unable to unlink quote.');
    }

    revalidateJobQuotes(jobId);
    redirect(quotesTab(jobId, result.message || 'Quote unlinked. The quote record was kept.'));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : 'Unable to unlink quote.';
    if (!uuid.test(jobId)) throw new Error(message);
    redirect(quotesTab(jobId, undefined, message));
  }
}

export async function setPrimaryJobQuote(formData: FormData): Promise<void> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  const jobId = String(formData.get('job_id') || '').trim();
  const quoteId = String(formData.get('quote_id') || '').trim();

  try {
    if (!uuid.test(jobId) || !uuid.test(quoteId)) throw new Error('Invalid job or quote reference.');
    const db = await requireJobQuotesTable();

    const { data, error } = await db.rpc('job_quote_set_primary_atomic', {
      p_job_id: jobId,
      p_quote_id: quoteId,
      p_actor: user.id,
    });
    if (missingAtomicRpc(error)) {
      throw new Error(
        'Setting a primary quote needs the job_quotes atomic migration. Refresh after it is applied.',
      );
    }
    const result = interpretJobQuoteAtomicResult(data, 'Unable to set primary quote.');
    if (error || !result.ok) {
      throw new Error(result.message || error?.message || 'Unable to set primary quote.');
    }

    revalidateJobQuotes(jobId);
    redirect(quotesTab(jobId, result.message || 'Primary quote updated.'));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : 'Unable to set primary quote.';
    if (!uuid.test(jobId)) throw new Error(message);
    redirect(quotesTab(jobId, undefined, message));
  }
}

/** Create a draft quote (or variation) and link it in one DB transaction. */
export async function createLinkedQuoteFromJob(formData: FormData): Promise<void> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  const jobId = String(formData.get('job_id') || '').trim();
  const kindRaw = String(formData.get('association_kind') || 'quote').trim();
  const labelRaw = String(formData.get('label') || '').trim();

  try {
    if (!uuid.test(jobId)) throw new Error('Invalid job reference.');
    if (!isJobQuoteKind(kindRaw)) throw new Error('Invalid association type.');

    const db = await requireJobQuotesTable();
    const { data: job } = await db
      .from('jobs')
      .select('id,title,description,customer_id,enquiry_id,site_address_text')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new Error('Job not found.');

    const compatibility = canLinkQuoteToJob(job.customer_id, job.customer_id);
    if (!compatibility.ok) throw new Error(compatibility.message);

    const { data: customer } = await db
      .from('customers')
      .select('name,email,phone')
      .eq('id', job.customer_id)
      .maybeSingle();
    if (!customer) throw new Error('Customer not found.');

    const kind = kindRaw as JobQuoteKind;
    const titleBase = String(job.title || 'Electrical work').trim();
    const title =
      kind === 'variation'
        ? `Variation — ${titleBase}`.slice(0, 200)
        : kind === 'additional_works'
          ? `Additional works — ${titleBase}`.slice(0, 200)
          : titleBase.slice(0, 200);

    const values = {
      customer_id: job.customer_id,
      enquiry_id: job.enquiry_id || null,
      site_address_id: null,
      site_address_snapshot: { address: job.site_address_text || '' },
      customer_snapshot: customer,
      title,
      scope_of_work: String(job.description || '').trim(),
      inclusions: '',
      exclusions: '',
      customer_notes: '',
      internal_notes: '',
      customer_display: 'itemised',
      pricing_mode: 'detailed',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await db.rpc('job_quote_create_and_link_atomic', {
      p_job_id: jobId,
      p_actor: user.id,
      p_values: values,
      p_association_kind: kind,
      p_label: labelRaw || (kind === 'quote' ? null : associationDefaultLabel(kind)),
      p_make_primary: false,
    });

    if (missingAtomicRpc(error)) {
      throw new Error(
        'Creating a linked quote needs the job_quotes create-and-link migration. Refresh after it is applied.',
      );
    }

    // RAISE from the RPC surfaces as a transport error; no orphan draft remains.
    if (error) {
      throw new Error(error.message || 'Unable to create and link quote.');
    }

    const result = interpretJobQuoteAtomicResult(data, 'Unable to create and link quote.');
    if (!result.ok || !result.quoteId) {
      // Defensive only: create_and_link raises instead of returning ok:false after a draft exists.
      if (result.quoteId) throw new Error(orphanDraftRecoveryMessage(result.quoteId));
      throw new Error(result.message || 'Unable to create and link quote.');
    }

    revalidateJobQuotes(jobId);
    revalidatePath(`/hq/quotes/${result.quoteId}`);
    redirect(`/hq/quotes/${result.quoteId}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : 'Unable to create quote.';
    if (!uuid.test(jobId)) throw new Error(message);
    redirect(quotesTab(jobId, undefined, message));
  }
}

function associationDefaultLabel(kind: JobQuoteKind): string {
  if (kind === 'variation') return 'Variation';
  if (kind === 'additional_works') return 'Additional works';
  return 'Quote';
}

/**
 * Sync jobs.quote_id into job_quotes after create-job-from-quote.
 * - Missing C1 migrations: skip (legacy jobs.quote_id only).
 * - Migrations present: must succeed or return failed for the caller to handle.
 */
export async function syncPrimaryJobQuoteAfterCreate(args: {
  jobId: string;
  quoteId: string;
  actorId: string;
}): Promise<PrimarySyncOutcome> {
  const db = dbAdmin();
  const { data, error } = await db.rpc('job_quote_sync_primary_after_create_atomic', {
    p_job_id: args.jobId,
    p_quote_id: args.quoteId,
    p_actor: args.actorId,
  });

  const missingMigration = Boolean(error && (isMissingJobQuotesRelation(error) || missingAtomicRpc(error)));
  const result = interpretJobQuoteAtomicResult(
    data,
    error?.message || 'Unable to sync primary quote association.',
  );
  return classifyPrimarySyncOutcome({
    missingMigration,
    result,
    transportErrorMessage: error?.message,
  });
}

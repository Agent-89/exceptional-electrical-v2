'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertOfficeOps, dbAdmin, requireHqUser } from '@/lib/hq-auth';
import {
  crossCustomerErrorMessage,
  duplicateAssociationErrorMessage,
  isJobQuoteKind,
  quoteCustomersCompatible,
  resolvePrimaryOnLink,
  type JobQuoteKind,
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
      .select('id,customer_id,quote_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new Error('Job not found.');

    const { data: quote } = await db
      .from('quotes')
      .select('id,customer_id,title')
      .eq('id', quoteId)
      .maybeSingle();
    if (!quote) throw new Error('Quote not found.');

    if (!quoteCustomersCompatible(job.customer_id, quote.customer_id)) {
      throw new Error(crossCustomerErrorMessage());
    }

    const { data: existingRows, error: existingError } = await db
      .from('job_quotes')
      .select('quote_id,is_primary')
      .eq('job_id', jobId);
    if (existingError) throw new Error('Unable to read existing quote links.');

    const existing = (existingRows ?? []).map((row) => ({
      quoteId: String(row.quote_id),
      isPrimary: Boolean(row.is_primary),
    }));

    if (existing.some((row) => row.quoteId === quoteId)) {
      throw new Error(duplicateAssociationErrorMessage());
    }

    // Include legacy primary for first-link decisions before backfill catches up.
    if (job.quote_id && !existing.some((row) => row.quoteId === job.quote_id)) {
      existing.push({ quoteId: String(job.quote_id), isPrimary: true });
    }

    const primaryPlan = resolvePrimaryOnLink({ makePrimary, existing, quoteId });

    if (primaryPlan.demoteQuoteIds.length) {
      const { error: demoteError } = await db
        .from('job_quotes')
        .update({ is_primary: false })
        .eq('job_id', jobId)
        .in('quote_id', primaryPlan.demoteQuoteIds);
      if (demoteError) throw new Error('Unable to update the primary quote.');
    }

    const { error: insertError } = await db.from('job_quotes').insert({
      job_id: jobId,
      quote_id: quoteId,
      is_primary: primaryPlan.quoteIsPrimary,
      association_kind: kindRaw as JobQuoteKind,
      label: labelRaw || null,
      linked_by: user.id,
    });

    if (insertError) {
      if (String(insertError.code) === '23505' || /duplicate|unique/i.test(insertError.message || '')) {
        throw new Error(duplicateAssociationErrorMessage());
      }
      throw new Error('Unable to link quote.');
    }

    if (primaryPlan.quoteIsPrimary) {
      const { error: jobError } = await db
        .from('jobs')
        .update({ quote_id: quoteId, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (jobError) throw new Error('Quote linked, but the primary pointer could not be updated.');
    }

    await db.from('job_activity').insert({
      job_id: jobId,
      actor_id: user.id,
      action: 'quote_linked',
      note: `${quote.title || quoteId}${primaryPlan.quoteIsPrimary ? ' (primary)' : ''}`,
    });

    revalidateJobQuotes(jobId);
    redirect(quotesTab(jobId, 'Quote linked.'));
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error;
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

  try {
    if (!uuid.test(jobId) || !uuid.test(quoteId)) throw new Error('Invalid job or quote reference.');
    const db = await requireJobQuotesTable();

    const { data: job } = await db.from('jobs').select('id,quote_id').eq('id', jobId).maybeSingle();
    if (!job) throw new Error('Job not found.');

    const { data: association } = await db
      .from('job_quotes')
      .select('id,is_primary')
      .eq('job_id', jobId)
      .eq('quote_id', quoteId)
      .maybeSingle();

    if (association) {
      const { error } = await db.from('job_quotes').delete().eq('id', association.id);
      if (error) throw new Error('Unable to unlink quote.');
    } else if (job.quote_id === quoteId) {
      // Legacy-only link: clear pointer without requiring a join row.
    } else {
      throw new Error('That quote is not linked to this job.');
    }

    if (job.quote_id === quoteId || association?.is_primary) {
      const { error: jobError } = await db
        .from('jobs')
        .update({ quote_id: null, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (jobError) throw new Error('Association removed, but the primary pointer could not be cleared.');
    }

    await db.from('job_activity').insert({
      job_id: jobId,
      actor_id: user.id,
      action: 'quote_unlinked',
      note: quoteId,
    });

    revalidateJobQuotes(jobId);
    redirect(quotesTab(jobId, 'Quote unlinked. The quote record was kept.'));
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error;
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

    const { data: association } = await db
      .from('job_quotes')
      .select('id')
      .eq('job_id', jobId)
      .eq('quote_id', quoteId)
      .maybeSingle();
    if (!association) throw new Error('Link the quote to this job before making it primary.');

    const { error: demoteError } = await db
      .from('job_quotes')
      .update({ is_primary: false })
      .eq('job_id', jobId)
      .neq('quote_id', quoteId);
    if (demoteError) throw new Error('Unable to update primary quote.');

    const { error: promoteError } = await db
      .from('job_quotes')
      .update({ is_primary: true })
      .eq('job_id', jobId)
      .eq('quote_id', quoteId);
    if (promoteError) throw new Error('Unable to set primary quote.');

    const { error: jobError } = await db
      .from('jobs')
      .update({ quote_id: quoteId, updated_at: new Date().toISOString() })
      .eq('id', jobId);
    if (jobError) throw new Error('Primary association saved, but jobs.quote_id could not be updated.');

    await db.from('job_activity').insert({
      job_id: jobId,
      actor_id: user.id,
      action: 'quote_primary_set',
      note: quoteId,
    });

    revalidateJobQuotes(jobId);
    redirect(quotesTab(jobId, 'Primary quote updated.'));
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error;
    const message = error instanceof Error ? error.message : 'Unable to set primary quote.';
    if (!uuid.test(jobId)) throw new Error(message);
    redirect(quotesTab(jobId, undefined, message));
  }
}

/** Create a draft quote (or variation) for this job's customer and link it immediately. */
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
      .select('id,title,description,customer_id,enquiry_id,site_address_text,quote_id')
      .eq('id', jobId)
      .maybeSingle();
    if (!job) throw new Error('Job not found.');
    if (!job.customer_id) throw new Error('Add a customer to this job before creating a quote.');

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

    const { data: quoteId, error: createError } = await db.rpc('save_quote_draft_atomic', {
      p_quote_id: null,
      p_values: values,
      p_lines: [],
      p_actor: user.id,
    });
    if (createError || !quoteId) throw new Error('Unable to create draft quote.');

    const { data: existingRows } = await db
      .from('job_quotes')
      .select('quote_id,is_primary')
      .eq('job_id', jobId);
    const existing = (existingRows ?? []).map((row) => ({
      quoteId: String(row.quote_id),
      isPrimary: Boolean(row.is_primary),
    }));
    if (job.quote_id && !existing.some((row) => row.quoteId === job.quote_id)) {
      existing.push({ quoteId: String(job.quote_id), isPrimary: true });
    }

    const primaryPlan = resolvePrimaryOnLink({
      makePrimary: existing.length === 0,
      existing,
      quoteId: String(quoteId),
    });

    const { error: linkError } = await db.from('job_quotes').insert({
      job_id: jobId,
      quote_id: quoteId,
      is_primary: primaryPlan.quoteIsPrimary,
      association_kind: kind,
      label: labelRaw || (kind === 'quote' ? null : associationDefaultLabel(kind)),
      linked_by: user.id,
    });
    if (linkError) throw new Error('Draft created, but linking to the job failed. Open Quotes to link it.');

    if (primaryPlan.quoteIsPrimary) {
      await db
        .from('jobs')
        .update({ quote_id: quoteId, updated_at: new Date().toISOString() })
        .eq('id', jobId);
    }

    await db.from('job_activity').insert({
      job_id: jobId,
      actor_id: user.id,
      action: 'quote_created_and_linked',
      note: title,
    });

    revalidateJobQuotes(jobId);
    revalidatePath(`/hq/quotes/${quoteId}`);
    redirect(`/hq/quotes/${quoteId}`);
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error) throw error;
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

/** Best-effort primary association insert used by createJob. Never throws away the job. */
export async function syncPrimaryJobQuoteAfterCreate(args: {
  jobId: string;
  quoteId: string;
  actorId: string;
}): Promise<void> {
  const db = dbAdmin();
  const { error } = await db.from('job_quotes').upsert(
    {
      job_id: args.jobId,
      quote_id: args.quoteId,
      is_primary: true,
      association_kind: 'quote',
      linked_by: args.actorId,
    },
    { onConflict: 'job_id,quote_id', ignoreDuplicates: true },
  );
  if (error && !isMissingJobQuotesRelation(error)) {
    // Soft-fail: jobs.quote_id already stores the legacy link.
    console.error('job_quotes sync after create failed', error.message);
  }
}

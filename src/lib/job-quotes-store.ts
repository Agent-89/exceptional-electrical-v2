import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isJobQuoteKind,
  mergeJobQuoteAssociations,
  quoteTotalIncGstCents,
  type JobQuoteAssociationInput,
  type JobQuoteDisplay,
  type JobQuoteKind,
} from '@/lib/job-quotes';

type QuoteRow = {
  id: string;
  quote_number: string;
  title: string | null;
  status: string;
  updated_at: string;
  pricing_mode: string | null;
  customer_id: string | null;
  parent_quote_id?: string | null;
  revision_number?: number | null;
  is_commercial_current?: boolean | null;
  quote_items:
    | {
        description: string | null;
        category: string | null;
        quantity: number | string;
        unit_price_cents: number | string;
        gst_applicable: boolean | null;
      }[]
    | null;
};

function isMissingJobQuotesRelation(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /job_quotes/i.test(message) ||
    /could not find the table/i.test(message) ||
    /relation .* does not exist/i.test(message)
  );
}

export async function listJobQuoteAssociationRows(
  db: SupabaseClient,
  jobId: string,
): Promise<{ rows: JobQuoteAssociationInput[]; tableAvailable: boolean; error: string | null }> {
  const { data, error } = await db
    .from('job_quotes')
    .select('quote_id,is_primary,association_kind,label,linked_at')
    .eq('job_id', jobId)
    .order('linked_at', { ascending: true });

  if (error) {
    if (isMissingJobQuotesRelation(error)) {
      return { rows: [], tableAvailable: false, error: null };
    }
    return { rows: [], tableAvailable: true, error: error.message || 'Unable to load quote links.' };
  }

  const rows: JobQuoteAssociationInput[] = (data ?? []).map((row) => ({
    quoteId: String(row.quote_id),
    isPrimary: Boolean(row.is_primary),
    associationKind: isJobQuoteKind(String(row.association_kind))
      ? (row.association_kind as JobQuoteKind)
      : 'quote',
    label: (row.label as string | null) ?? null,
    linkedAt: (row.linked_at as string | null) ?? null,
    source: 'job_quotes' as const,
  }));

  return { rows, tableAvailable: true, error: null };
}

export async function loadJobQuotesForDisplay(
  db: SupabaseClient,
  jobId: string,
  legacyPrimaryQuoteId: string | null | undefined,
): Promise<{
  quotes: JobQuoteDisplay[];
  tableAvailable: boolean;
  error: string | null;
}> {
  const listed = await listJobQuoteAssociationRows(db, jobId);
  if (listed.error) {
    return { quotes: [], tableAvailable: listed.tableAvailable, error: listed.error };
  }

  const merged = mergeJobQuoteAssociations({
    legacyPrimaryQuoteId,
    associations: listed.rows,
  });

  if (!merged.length) {
    return { quotes: [], tableAvailable: listed.tableAvailable, error: null };
  }

  const ids = merged.map((row) => row.quoteId);
  const commercialSelect =
    'id,quote_number,title,status,updated_at,pricing_mode,customer_id,parent_quote_id,revision_number,is_commercial_current,quote_items(description,category,quantity,unit_price_cents,gst_applicable)';
  const baseSelect =
    'id,quote_number,title,status,updated_at,pricing_mode,customer_id,parent_quote_id,revision_number,quote_items(description,category,quantity,unit_price_cents,gst_applicable)';

  let quoteRows: QuoteRow[] | null = null;
  let quoteError: { message?: string; code?: string } | null = null;
  {
    const first = await db.from('quotes').select(commercialSelect).in('id', ids);
    if (first.error && /is_commercial_current|commercial_family_id/i.test(first.error.message || '')) {
      const second = await db.from('quotes').select(baseSelect).in('id', ids);
      quoteRows = (second.data ?? null) as QuoteRow[] | null;
      quoteError = second.error;
    } else {
      quoteRows = (first.data ?? null) as QuoteRow[] | null;
      quoteError = first.error;
    }
  }

  if (quoteError) {
    return {
      quotes: [],
      tableAvailable: listed.tableAvailable,
      error: quoteError.message || 'Unable to load quotes.',
    };
  }

  const byId = new Map<string, QuoteRow>();
  for (const row of quoteRows ?? []) {
    byId.set(row.id, row);
  }

  const parentIds = [
    ...new Set(
      (quoteRows ?? [])
        .map((row) => row.parent_quote_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const parentNumberById = new Map<string, string>();
  if (parentIds.length) {
    const { data: parents } = await db.from('quotes').select('id,quote_number').in('id', parentIds);
    for (const parent of parents ?? []) {
      parentNumberById.set(String(parent.id), String(parent.quote_number));
    }
  }

  const quotes: JobQuoteDisplay[] = [];
  for (const assoc of merged) {
    const q = byId.get(assoc.quoteId);
    if (!q) continue;
    quotes.push({
      ...assoc,
      id: q.id,
      quoteNumber: q.quote_number,
      title: q.title || '',
      status: q.status,
      updatedAt: q.updated_at,
      totalCentsIncGst: quoteTotalIncGstCents(q.quote_items, q.pricing_mode),
      isCommercialCurrent: Boolean(q.is_commercial_current),
      parentQuoteId: q.parent_quote_id ?? null,
      parentQuoteNumber: q.parent_quote_id ? parentNumberById.get(q.parent_quote_id) || null : null,
      revisionNumber: Number(q.revision_number || 0),
    });
  }

  return { quotes, tableAvailable: listed.tableAvailable, error: null };
}

export async function listLinkableQuotesForJob(
  db: SupabaseClient,
  args: { customerId: string | null; excludeQuoteIds: string[] },
): Promise<{ id: string; quote_number: string; title: string | null; status: string }[]> {
  // Never list quotes when the job has no customer — prevents unrelated customer picks.
  if (!args.customerId) return [];

  const { data, error } = await db
    .from('quotes')
    .select('id,quote_number,title,status,customer_id,updated_at')
    .eq('customer_id', args.customerId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  const excluded = new Set(args.excludeQuoteIds);
  return data
    .filter((row) => !excluded.has(row.id as string))
    .map((row) => ({
      id: row.id as string,
      quote_number: row.quote_number as string,
      title: (row.title as string | null) ?? null,
      status: row.status as string,
    }));
}

export { isMissingJobQuotesRelation };

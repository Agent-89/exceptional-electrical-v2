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
  const { data: quoteRows, error: quoteError } = await db
    .from('quotes')
    .select(
      'id,quote_number,title,status,updated_at,pricing_mode,customer_id,quote_items(description,category,quantity,unit_price_cents,gst_applicable)',
    )
    .in('id', ids);

  if (quoteError) {
    return {
      quotes: [],
      tableAvailable: listed.tableAvailable,
      error: quoteError.message || 'Unable to load quotes.',
    };
  }

  const byId = new Map<string, QuoteRow>();
  for (const row of (quoteRows ?? []) as QuoteRow[]) {
    byId.set(row.id, row);
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

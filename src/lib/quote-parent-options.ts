import type { ParentQuoteOption } from '@/lib/quote-commercial';
import { isValidVariationParentCandidate } from '@/lib/quote-commercial';
import { isMissingJobQuotesRelation } from '@/lib/job-quotes-store';

type QueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message?: string; code?: string } | null;
};

type QueryBuilder = PromiseLike<QueryResult> & {
  select(cols: string): QueryBuilder;
  eq(col: string, value: string): QueryBuilder;
  in(col: string, values: string[]): QueryBuilder;
  order(col: string, opts?: { ascending?: boolean }): QueryBuilder;
  limit(n: number): QueryBuilder;
  maybeSingle(): Promise<{
    data: Record<string, unknown> | null;
    error: { message?: string; code?: string } | null;
  }>;
};

/** Minimal Supabase-like client surface used by these loaders. */
export type ParentOptionsDb = {
  from: (table: string) => QueryBuilder;
};

/** Load same-customer parent candidates with linked jobs, excluding invalid parents. */
export async function loadParentQuoteOptions(args: {
  db: ParentOptionsDb;
  customerId: string;
  editingQuoteId?: string | null;
  editingAncestorIds?: string[];
}): Promise<ParentQuoteOption[]> {
  if (!args.customerId) return [];

  const { data: parents, error } = await args.db
    .from('quotes')
    .select('id,quote_number,title,status,revision_number,parent_quote_id,customer_id')
    .eq('customer_id', args.customerId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !parents?.length) return [];

  const eligible = parents.filter((row) =>
    isValidVariationParentCandidate({
      candidateId: String(row.id),
      candidateStatus: String(row.status || ''),
      candidateCustomerId: (row.customer_id as string) || null,
      quoteCustomerId: args.customerId,
      editingQuoteId: args.editingQuoteId,
      editingAncestorIds: args.editingAncestorIds,
    }),
  );

  if (!eligible.length) return [];

  const quoteIds = eligible.map((row) => String(row.id));
  const parentIds = [
    ...new Set(
      eligible
        .map((row) => (row.parent_quote_id ? String(row.parent_quote_id) : ''))
        .filter(Boolean),
    ),
  ];

  const parentNumberById = new Map<string, string>();
  if (parentIds.length) {
    const { data: parentRows } = await args.db
      .from('quotes')
      .select('id,quote_number')
      .in('id', parentIds);
    for (const row of parentRows || []) {
      parentNumberById.set(String(row.id), String(row.quote_number));
    }
  }

  const jobsByQuote = new Map<string, { id: string; jobNumber: string | null; title: string | null }[]>();
  const { data: links, error: linkError } = await args.db
    .from('job_quotes')
    .select('quote_id,job_id')
    .in('quote_id', quoteIds);

  if (!(linkError && isMissingJobQuotesRelation(linkError)) && links?.length) {
    const jobIds = [...new Set(links.map((l) => String(l.job_id)))];
    const { data: jobs } = await args.db
      .from('jobs')
      .select('id,job_number,title')
      .in('id', jobIds);
    type JobBrief = { id: string; jobNumber: string | null; title: string | null };
    const jobById = new Map<string, JobBrief>();
    for (const j of jobs || []) {
      jobById.set(String(j.id), {
        id: String(j.id),
        jobNumber: (j.job_number as string | null) || null,
        title: (j.title as string | null) || null,
      });
    }
    for (const link of links) {
      const job = jobById.get(String(link.job_id));
      if (!job) continue;
      const list = jobsByQuote.get(String(link.quote_id)) || [];
      if (!list.some((row) => row.id === job.id)) list.push(job);
      jobsByQuote.set(String(link.quote_id), list);
    }
  }

  const { data: legacyJobs } = await args.db
    .from('jobs')
    .select('id,job_number,title,quote_id')
    .in('quote_id', quoteIds);
  for (const job of legacyJobs || []) {
    if (!job.quote_id) continue;
    const list = jobsByQuote.get(String(job.quote_id)) || [];
    if (!list.some((j) => j.id === String(job.id))) {
      list.push({
        id: String(job.id),
        jobNumber: (job.job_number as string | null) || null,
        title: (job.title as string | null) || null,
      });
      jobsByQuote.set(String(job.quote_id), list);
    }
  }

  return eligible.map((row) => ({
    id: String(row.id),
    quoteNumber: String(row.quote_number),
    title: (row.title as string) || null,
    status: String(row.status),
    revisionNumber: Number(row.revision_number || 0),
    parentQuoteNumber: row.parent_quote_id
      ? parentNumberById.get(String(row.parent_quote_id)) || null
      : null,
    linkedJobs: jobsByQuote.get(String(row.id)) || [],
  }));
}

export async function loadLinkedJobsForQuote(args: {
  db: ParentOptionsDb;
  quoteId: string;
}): Promise<{ id: string; jobNumber: string | null; title: string | null }[]> {
  const out: { id: string; jobNumber: string | null; title: string | null }[] = [];
  const seen = new Set<string>();

  const { data: links, error } = await args.db
    .from('job_quotes')
    .select('job_id')
    .eq('quote_id', args.quoteId)
    .order('linked_at', { ascending: true });

  if (!(error && isMissingJobQuotesRelation(error))) {
    for (const link of links || []) {
      const jobId = String(link.job_id);
      if (seen.has(jobId)) continue;
      seen.add(jobId);
      const { data: job } = await args.db
        .from('jobs')
        .select('id,job_number,title')
        .eq('id', jobId)
        .maybeSingle();
      if (job) {
        out.push({
          id: String(job.id),
          jobNumber: (job.job_number as string | null) || null,
          title: (job.title as string | null) || null,
        });
      }
    }
  }

  const { data: legacy } = await args.db
    .from('jobs')
    .select('id,job_number,title')
    .eq('quote_id', args.quoteId);
  for (const job of legacy || []) {
    if (seen.has(String(job.id))) continue;
    seen.add(String(job.id));
    out.push({
      id: String(job.id),
      jobNumber: (job.job_number as string | null) || null,
      title: (job.title as string | null) || null,
    });
  }

  return out;
}

export async function loadCustomerJobs(args: {
  db: ParentOptionsDb;
  customerId: string;
  excludeJobIds?: string[];
}): Promise<{ id: string; jobNumber: string | null; title: string | null }[]> {
  if (!args.customerId) return [];
  const exclude = new Set(args.excludeJobIds || []);
  const { data: jobs } = await args.db
    .from('jobs')
    .select('id,job_number,title')
    .eq('customer_id', args.customerId)
    .order('updated_at', { ascending: false })
    .limit(100);
  return (jobs || [])
    .filter((j) => !exclude.has(String(j.id)))
    .map((j) => ({
      id: String(j.id),
      jobNumber: (j.job_number as string | null) || null,
      title: (j.title as string | null) || null,
    }));
}

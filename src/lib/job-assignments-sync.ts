import type { SupabaseClient } from '@supabase/supabase-js';

/** Pure filter: staff ids not already on the job team. */
export function selectStaffToAddToJob(existing: string[], incoming: string[]): string[] {
  const have = new Set(existing);
  return [...new Set(incoming.filter(Boolean))].filter((id) => !have.has(id));
}

/** Union visit/default crew into job_assignments. Never removes existing members. */
export async function ensureJobAssignments(
  db: SupabaseClient,
  args: {
    jobId: string;
    staffIds: string[];
    actorId: string | null;
  },
): Promise<{ added: string[] }> {
  if (![...new Set(args.staffIds.filter(Boolean))].length) return { added: [] };

  const { data: existing, error: readError } = await db
    .from('job_assignments')
    .select('staff_id')
    .eq('job_id', args.jobId);
  if (readError) return { added: [] };

  const toAdd = selectStaffToAddToJob(
    (existing ?? []).map((row) => String(row.staff_id)),
    args.staffIds,
  );
  if (!toAdd.length) return { added: [] };

  const { error: upsertError } = await db.from('job_assignments').upsert(
    toAdd.map((staff_id) => ({ job_id: args.jobId, staff_id })),
    { onConflict: 'job_id,staff_id', ignoreDuplicates: true },
  );
  if (upsertError) return { added: [] };

  await db.from('job_activity').insert({
    job_id: args.jobId,
    actor_id: args.actorId,
    action: 'staff_assigned',
    note:
      toAdd.length === 1
        ? 'Electrician added to job team from visit crew'
        : `Added ${toAdd.length} electricians to job team from visit crew`,
  });

  return { added: toAdd };
}

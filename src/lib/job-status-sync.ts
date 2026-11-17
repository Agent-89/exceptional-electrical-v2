import type { SupabaseClient } from '@supabase/supabase-js';
import {
  nextJobStatusFromTrigger,
  type JobStatus,
  type JobStatusSyncTrigger,
} from '@/lib/job-statuses';

export type { JobStatusSyncTrigger };
export { nextJobStatusFromTrigger };

const DEFAULT_NOTES: Record<JobStatusSyncTrigger, string> = {
  appointment_created: 'Status auto-updated after appointment scheduled',
  work_started: 'Status auto-updated after work timer started',
  staff_assigned: 'Status auto-updated after electrician assigned',
};

export async function applyJobStatusSync(
  db: SupabaseClient,
  args: {
    jobId: string;
    trigger: JobStatusSyncTrigger;
    actorId: string | null;
    note?: string;
  },
): Promise<{ changed: boolean; from: string | null; to: JobStatus | null }> {
  const { data: job, error } = await db
    .from('jobs')
    .select('status')
    .eq('id', args.jobId)
    .maybeSingle();
  if (error || !job) return { changed: false, from: null, to: null };

  const from = String(job.status);
  const to = nextJobStatusFromTrigger(from, args.trigger);
  if (!to || to === from) return { changed: false, from, to: null };

  const { error: updateError } = await db
    .from('jobs')
    .update({
      status: to,
      updated_at: new Date().toISOString(),
      completed_at: null,
    })
    .eq('id', args.jobId)
    .eq('status', from);
  if (updateError) return { changed: false, from, to: null };

  await db.from('job_activity').insert({
    job_id: args.jobId,
    actor_id: args.actorId,
    action: 'status_changed',
    note: args.note || `${DEFAULT_NOTES[args.trigger]} · ${from} → ${to}`,
  });

  return { changed: true, from, to };
}

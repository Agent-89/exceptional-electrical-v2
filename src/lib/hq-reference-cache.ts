import 'server-only';
import { unstable_cache } from 'next/cache';
import { dbAdmin } from '@/lib/hq-auth';

export const HQ_STAFF_CACHE_TAG = 'hq-scheduling-staff';

export type CachedSchedulingStaff = {
  id: string;
  full_name: string;
  initials: string | null;
  avatar_color: string | null;
};

async function loadActiveSchedulingStaff(): Promise<CachedSchedulingStaff[]> {
  const { data, error } = await dbAdmin()
    .from('scheduling_staff')
    .select('id,full_name,initials,avatar_color')
    .eq('active', true)
    .order('full_name')
    .limit(300);
  if (error) throw new Error('Unable to load scheduling staff.');
  return (data ?? []) as CachedSchedulingStaff[];
}

/** Tagged cache for the active crew directory used by schedule/job pickers. */
export const getCachedActiveSchedulingStaff = unstable_cache(
  loadActiveSchedulingStaff,
  ['hq-active-scheduling-staff'],
  { revalidate: 60, tags: [HQ_STAFF_CACHE_TAG] },
);

export type JobTimeListEntry = {
  id: string;
  status: string;
  startedAt: string;
};

export type JobTimeListFilter = 'pending' | 'all';

const PENDING = new Set(['submitted', 'rejected', 'corrected']);
const LIVE = new Set(['active', 'on_break']);

export function isPendingJobTimeStatus(status: string): boolean {
  return PENDING.has(status);
}

export function isLiveJobTimeStatus(status: string): boolean {
  return LIVE.has(status);
}

/** Pending first, then newest start time. Live timers stay available under All. */
export function sortJobTimeEntries<T extends JobTimeListEntry>(entries: T[]): T[] {
  return [...entries]
    .filter((entry) => entry.status !== 'cancelled')
    .sort((a, b) => {
      const aPending = isPendingJobTimeStatus(a.status) ? 0 : 1;
      const bPending = isPendingJobTimeStatus(b.status) ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return b.startedAt.localeCompare(a.startedAt);
    });
}

export function filterJobTimeEntries<T extends JobTimeListEntry>(
  entries: T[],
  filter: JobTimeListFilter,
): T[] {
  const sorted = sortJobTimeEntries(entries);
  if (filter === 'pending') return sorted.filter((entry) => isPendingJobTimeStatus(entry.status));
  return sorted;
}

export function jobTimeListSummary(entries: JobTimeListEntry[]): {
  pendingCount: number;
  liveCount: number;
  totalCount: number;
} {
  const active = entries.filter((entry) => entry.status !== 'cancelled');
  return {
    pendingCount: active.filter((entry) => isPendingJobTimeStatus(entry.status)).length,
    liveCount: active.filter((entry) => isLiveJobTimeStatus(entry.status)).length,
    totalCount: active.length,
  };
}

export function canReviewJobTimeEntry(status: string): boolean {
  return ['submitted', 'rejected', 'corrected', 'approved'].includes(status);
}

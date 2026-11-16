export type JobTimeListEntry = {
  id: string;
  status: string;
  startedAt: string;
};

export type JobTimeListFilter = 'all' | 'pending' | 'approved';

const PENDING = new Set(['submitted', 'rejected', 'corrected']);
const LIVE = new Set(['active', 'on_break']);
const APPROVED = new Set(['approved']);

export function isPendingJobTimeStatus(status: string): boolean {
  return PENDING.has(status);
}

export function isLiveJobTimeStatus(status: string): boolean {
  return LIVE.has(status);
}

export function isApprovedJobTimeStatus(status: string): boolean {
  return APPROVED.has(status);
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
  if (filter === 'approved') return sorted.filter((entry) => isApprovedJobTimeStatus(entry.status));
  return sorted;
}

export function jobTimeListSummary(entries: JobTimeListEntry[]): {
  pendingCount: number;
  approvedCount: number;
  liveCount: number;
  totalCount: number;
} {
  const active = entries.filter((entry) => entry.status !== 'cancelled');
  return {
    pendingCount: active.filter((entry) => isPendingJobTimeStatus(entry.status)).length,
    approvedCount: active.filter((entry) => isApprovedJobTimeStatus(entry.status)).length,
    liveCount: active.filter((entry) => isLiveJobTimeStatus(entry.status)).length,
    totalCount: active.length,
  };
}

export function canReviewJobTimeEntry(status: string): boolean {
  return ['submitted', 'rejected', 'corrected', 'approved'].includes(status);
}

/** Office-facing status labels for the unified Time table. */
export function jobTimeStatusLabel(status: string): string {
  switch (status) {
    case 'submitted':
      return 'Pending';
    case 'corrected':
      return 'Corrected';
    case 'rejected':
      return 'Rejected';
    case 'approved':
      return 'Approved';
    case 'active':
      return 'Live';
    case 'on_break':
      return 'On break';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status.replaceAll('_', ' ');
  }
}

/** Unique entry ids in display order — used by regression checks. */
export function uniqueJobTimeEntryIds<T extends JobTimeListEntry>(
  entries: T[],
  filter: JobTimeListFilter = 'all',
): string[] {
  const rows = filterJobTimeEntries(entries, filter);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
  }
  return ids;
}

/**
 * Office job detail tabs. UI navigation only — no schema or permission changes.
 * Invoices is a placeholder until C2/Xero. Costs stays out of the top bar until
 * materials tracking lands; old `?tab=costs` links fall back to Overview.
 */

export const JOB_DETAIL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'notes', label: 'Notes' },
  { id: 'visits', label: 'Visits' },
  { id: 'time', label: 'Time' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activity', label: 'Activity' },
  { id: 'more', label: 'More' },
] as const;

export type JobDetailTabId = (typeof JOB_DETAIL_TABS)[number]['id'];

const TAB_IDS = new Set<string>(JOB_DETAIL_TABS.map((tab) => tab.id));

export function isJobDetailTabId(value: string): value is JobDetailTabId {
  return TAB_IDS.has(value);
}

/** Unknown or empty values stay on Overview so a bad link still opens the job. */
export function parseJobDetailTab(value: string | null | undefined): JobDetailTabId {
  const raw = (value ?? '').trim().toLowerCase();
  return isJobDetailTabId(raw) ? raw : 'overview';
}

export function jobDetailTabHref(jobId: string, tab: JobDetailTabId): string {
  const path = `/hq/jobs/${jobId}`;
  return tab === 'overview' ? path : `${path}?tab=${tab}`;
}

export function adjacentJobDetailTab(current: JobDetailTabId, direction: 1 | -1): JobDetailTabId {
  const index = JOB_DETAIL_TABS.findIndex((tab) => tab.id === current);
  const next = (index + direction + JOB_DETAIL_TABS.length) % JOB_DETAIL_TABS.length;
  return JOB_DETAIL_TABS[next].id;
}

/** Horizontal tablist keys. Up/Down stay with the page so they can scroll. */
export function jobDetailTabFromKey(current: JobDetailTabId, key: string): JobDetailTabId | null {
  if (key === 'ArrowRight') return adjacentJobDetailTab(current, 1);
  if (key === 'ArrowLeft') return adjacentJobDetailTab(current, -1);
  if (key === 'Home') return JOB_DETAIL_TABS[0].id;
  if (key === 'End') return JOB_DETAIL_TABS[JOB_DETAIL_TABS.length - 1].id;
  return null;
}

/** Exactly one panel is shown. Inactive panels stay out of the visual layout. */
export function visibleJobDetailPanels(active: JobDetailTabId): JobDetailTabId[] {
  return JOB_DETAIL_TABS.map((tab) => tab.id).filter((id) => id === active);
}

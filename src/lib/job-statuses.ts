/** Verified production jobs_status_check values (Nov 2026). `archived` is not supported. */
export const JOB_STATUSES = [
  'unassigned',
  'assigned',
  'scheduled',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  unassigned: 'Unassigned',
  assigned: 'Assigned',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

/** Jobs that can still receive new appointments / appear in schedule pickers. */
export function isSchedulableJobStatus(status: string): boolean {
  return isJobStatus(status) && status !== 'completed' && status !== 'cancelled';
}

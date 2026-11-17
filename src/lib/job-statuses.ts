/** Verified production jobs_status_check values (Nov 2026), plus to_invoice / tafe pending migration. */
export const JOB_STATUSES = [
  'unassigned',
  'assigned',
  'scheduled',
  'in_progress',
  'on_hold',
  'to_invoice',
  'tafe',
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
  to_invoice: 'To invoice',
  tafe: 'TAFE',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Dot / pill accent tokens for the job header status control. */
export const JOB_STATUS_TONES: Record<JobStatus, string> = {
  unassigned: 'neutral',
  assigned: 'info',
  scheduled: 'info',
  in_progress: 'success',
  on_hold: 'warning',
  to_invoice: 'accent',
  tafe: 'neutral',
  completed: 'success',
  cancelled: 'danger',
};

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

/** Jobs that can still receive new appointments / appear in schedule pickers. */
export function isSchedulableJobStatus(status: string): boolean {
  return (
    isJobStatus(status) &&
    status !== 'completed' &&
    status !== 'cancelled' &&
    status !== 'to_invoice' &&
    status !== 'tafe'
  );
}

export type JobStatusSyncTrigger = 'appointment_created' | 'work_started' | 'staff_assigned';

const AUTO_STATUS_LOCKED: ReadonlySet<JobStatus> = new Set([
  'on_hold',
  'to_invoice',
  'tafe',
  'completed',
  'cancelled',
]);

/** Pure next-status rules for automatic job status transitions. Returns null when no change. */
export function nextJobStatusFromTrigger(
  current: string,
  trigger: JobStatusSyncTrigger,
): JobStatus | null {
  if (!isJobStatus(current) || AUTO_STATUS_LOCKED.has(current)) return null;

  if (trigger === 'appointment_created') {
    if (current === 'unassigned' || current === 'assigned') return 'scheduled';
    return null;
  }

  if (trigger === 'work_started') {
    if (current === 'unassigned' || current === 'assigned' || current === 'scheduled') {
      return 'in_progress';
    }
    return null;
  }

  if (trigger === 'staff_assigned') {
    if (current === 'unassigned') return 'assigned';
    return null;
  }

  return null;
}

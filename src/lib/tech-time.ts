import 'server-only';
import { dbAdmin } from '@/lib/hq-auth';
import { computeWorkedMinutes, elapsedWholeMinutes } from '@/lib/tech-time-format';
import { deriveVisitFieldStatusFromLiveTimers } from '@/lib/tech-time-multi';

export {
  computeWorkedMinutes,
  elapsedWholeMinutes,
  formatDurationMinutes,
} from '@/lib/tech-time-format';
export { aggregateLabourByJob, deriveVisitFieldStatusFromLiveTimers } from '@/lib/tech-time-multi';

export type TimeEntryStatus =
  | 'active'
  | 'on_break'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'corrected'
  | 'cancelled';

export type JobTimeEntry = {
  id: string;
  jobId: string;
  appointmentId: string | null;
  staffId: string;
  technicianUserId: string;
  startedAt: string;
  endedAt: string | null;
  breakStartedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
  status: TimeEntryStatus;
  entrySource: 'timer' | 'manual';
  note: string | null;
  originalStartedAt: string | null;
  originalEndedAt: string | null;
  originalBreakMinutes: number | null;
  originalWorkedMinutes: number | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  job_id: string;
  appointment_id: string | null;
  staff_id: string;
  technician_user_id: string;
  started_at: string;
  ended_at: string | null;
  break_started_at: string | null;
  break_minutes: number;
  worked_minutes: number | null;
  billable_minutes: number | null;
  status: TimeEntryStatus;
  entry_source: 'timer' | 'manual';
  note: string | null;
  original_started_at: string | null;
  original_ended_at: string | null;
  original_break_minutes: number | null;
  original_worked_minutes: number | null;
  created_at: string;
  updated_at: string;
};

const SELECT =
  'id,job_id,appointment_id,staff_id,technician_user_id,started_at,ended_at,break_started_at,break_minutes,worked_minutes,billable_minutes,status,entry_source,note,original_started_at,original_ended_at,original_break_minutes,original_worked_minutes,created_at,updated_at';

export function mapTimeEntry(row: DbRow): JobTimeEntry {
  return {
    id: row.id,
    jobId: row.job_id,
    appointmentId: row.appointment_id,
    staffId: row.staff_id,
    technicianUserId: row.technician_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    breakStartedAt: row.break_started_at,
    breakMinutes: row.break_minutes,
    workedMinutes: row.worked_minutes,
    billableMinutes: row.billable_minutes,
    status: row.status,
    entrySource: row.entry_source,
    note: row.note,
    originalStartedAt: row.original_started_at,
    originalEndedAt: row.original_ended_at,
    originalBreakMinutes: row.original_break_minutes,
    originalWorkedMinutes: row.original_worked_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Live worked minutes including open break handling for display. */
export function liveWorkedMinutes(entry: JobTimeEntry, nowIso = new Date().toISOString()): number {
  if (entry.endedAt && entry.workedMinutes != null) return entry.workedMinutes;
  let end = nowIso;
  if (entry.status === 'on_break' && entry.breakStartedAt) {
    end = entry.breakStartedAt;
  }
  return computeWorkedMinutes(entry.startedAt, end, entry.breakMinutes);
}

export function liveBreakMinutes(entry: JobTimeEntry, nowIso = new Date().toISOString()): number {
  if (entry.status === 'on_break' && entry.breakStartedAt) {
    return entry.breakMinutes + elapsedWholeMinutes(entry.breakStartedAt, nowIso);
  }
  return entry.breakMinutes;
}

export async function getActiveTimeEntryForTechnician(
  technicianUserId: string,
): Promise<JobTimeEntry | null> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .select(SELECT)
    .eq('technician_user_id', technicianUserId)
    .in('status', ['active', 'on_break'])
    .maybeSingle();
  if (error) throw new Error('Unable to load active time entry.');
  return data ? mapTimeEntry(data as DbRow) : null;
}

export async function listTimeEntriesForAppointment(
  appointmentId: string,
): Promise<JobTimeEntry[]> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .select(SELECT)
    .eq('appointment_id', appointmentId)
    .neq('status', 'cancelled')
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Unable to load time entries.');
  return (data ?? []).map((row) => mapTimeEntry(row as DbRow));
}

export async function listTimeEntriesForJob(jobId: string): Promise<JobTimeEntry[]> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .select(SELECT)
    .eq('job_id', jobId)
    .neq('status', 'cancelled')
    .order('started_at', { ascending: false })
    .limit(100);
  if (error) throw new Error('Unable to load job time entries.');
  return (data ?? []).map((row) => mapTimeEntry(row as DbRow));
}

export async function getTimeEntry(id: string): Promise<JobTimeEntry | null> {
  const db = dbAdmin();
  const { data, error } = await db.from('job_time_entries').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error('Unable to load time entry.');
  return data ? mapTimeEntry(data as DbRow) : null;
}

/**
 * Sync shared visit field_status from live timers without letting one
 * technician's pause flip the visit while another tech is still working.
 */
export async function syncAppointmentFieldStatusFromLiveTimers(
  appointmentId: string,
): Promise<'in_progress' | 'paused' | null> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .select('technician_user_id,status')
    .eq('appointment_id', appointmentId)
    .in('status', ['active', 'on_break']);
  if (error) throw new Error('Unable to inspect live timers for visit.');

  const next = deriveVisitFieldStatusFromLiveTimers(
    (data ?? []).map((row) => ({
      technicianUserId: row.technician_user_id as string,
      status: row.status as 'active' | 'on_break',
    })),
  );
  if (!next) return null;

  const { error: updateError } = await db
    .from('job_appointments')
    .update({ field_status: next })
    .eq('id', appointmentId)
    .in('field_status', ['scheduled', 'in_progress', 'paused']);
  if (updateError) throw new Error('Unable to sync visit progress from timers.');
  return next;
}

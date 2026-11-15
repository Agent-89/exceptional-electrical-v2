import 'server-only';
import { dbAdmin } from '@/lib/hq-auth';
import {
  isVisitOutcomeStatus,
  normalizeVisitReportText,
  type TechWorkReportFields,
  type TechWorkReportSnapshot,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';
import {
  isMissingTechReportsRelation,
  TECH_REPORTS_MIGRATION_REQUIRED,
} from '@/lib/tech-work-reports-errors';
export { isMissingTechReportsRelation } from '@/lib/tech-work-reports-errors';

export type TechWorkReportRow = {
  id: string;
  appointmentId: string;
  jobId: string;
  staffId: string;
  technicianUserId: string;
  technicianName: string | null;
  workSummary: string | null;
  outstandingWork: string | null;
  issues: string | null;
  followUpRequired: boolean;
  progressStatus: VisitOutcomeStatus;
  createdAt: string;
  updatedAt: string;
};

type DbTechReport = {
  id: string;
  appointment_id: string;
  job_id: string;
  staff_id: string;
  technician_user_id: string;
  work_summary: string | null;
  outstanding_work: string | null;
  issues: string | null;
  follow_up_required: boolean;
  progress_status: string;
  created_at: string;
  updated_at: string;
};

function mapRow(row: DbTechReport, nameMap: Map<string, string>): TechWorkReportRow {
  const progress = isVisitOutcomeStatus(row.progress_status)
    ? row.progress_status
    : 'in_progress';
  return {
    id: row.id,
    appointmentId: row.appointment_id,
    jobId: row.job_id,
    staffId: row.staff_id,
    technicianUserId: row.technician_user_id,
    technicianName: nameMap.get(row.technician_user_id) ?? null,
    workSummary: row.work_summary,
    outstandingWork: row.outstanding_work,
    issues: row.issues,
    followUpRequired: Boolean(row.follow_up_required),
    progressStatus: progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function nameMapFor(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const db = dbAdmin();
  const { data } = await db
    .from('staff_profiles')
    .select('user_id,full_name')
    .in('user_id', [...new Set(userIds)]);
  return new Map((data ?? []).map((a) => [a.user_id as string, a.full_name as string]));
}

export async function getTechWorkReportForTechnician(input: {
  appointmentId: string;
  technicianUserId: string;
}): Promise<TechWorkReportRow | null> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_appointment_tech_reports')
    .select(
      'id,appointment_id,job_id,staff_id,technician_user_id,work_summary,outstanding_work,issues,follow_up_required,progress_status,created_at,updated_at',
    )
    .eq('appointment_id', input.appointmentId)
    .eq('technician_user_id', input.technicianUserId)
    .maybeSingle();
  if (error) {
    // Unmigrated environments only — partial/failed schema errors must throw.
    if (isMissingTechReportsRelation(error)) return null;
    throw new Error('Unable to load technician work report.');
  }
  if (!data) return null;
  const names = await nameMapFor([data.technician_user_id as string]);
  return mapRow(data as DbTechReport, names);
}

export async function listTechWorkReportsForJob(jobId: string): Promise<TechWorkReportRow[]> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_appointment_tech_reports')
    .select(
      'id,appointment_id,job_id,staff_id,technician_user_id,work_summary,outstanding_work,issues,follow_up_required,progress_status,created_at,updated_at',
    )
    .eq('job_id', jobId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingTechReportsRelation(error)) return [];
    throw new Error('Unable to load technician work reports.');
  }
  const rows = (data ?? []) as DbTechReport[];
  const names = await nameMapFor(rows.map((r) => r.technician_user_id));
  return rows.map((r) => mapRow(r, names));
}

export async function listTechWorkReportsForAppointment(
  appointmentId: string,
): Promise<TechWorkReportRow[]> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_appointment_tech_reports')
    .select(
      'id,appointment_id,job_id,staff_id,technician_user_id,work_summary,outstanding_work,issues,follow_up_required,progress_status,created_at,updated_at',
    )
    .eq('appointment_id', appointmentId)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) {
    if (isMissingTechReportsRelation(error)) return [];
    throw new Error('Unable to load technician work reports.');
  }
  const rows = (data ?? []) as DbTechReport[];
  const names = await nameMapFor(rows.map((r) => r.technician_user_id));
  return rows.map((r) => mapRow(r, names));
}

export function techWorkReportToSnapshot(row: TechWorkReportRow | null): TechWorkReportSnapshot {
  if (!row) {
    return {
      workSummary: null,
      outstandingWork: null,
      issues: null,
      followUpRequired: false,
      progressStatus: 'in_progress',
      updatedAt: null,
    };
  }
  return {
    workSummary: row.workSummary,
    outstandingWork: row.outstandingWork,
    issues: row.issues,
    followUpRequired: row.followUpRequired,
    progressStatus: row.progressStatus,
    updatedAt: row.updatedAt,
  };
}

export function fieldsFromTechWorkReportRow(row: TechWorkReportRow): TechWorkReportFields {
  return {
    workSummary: row.workSummary,
    outstandingWork: row.outstandingWork,
    issues: row.issues,
    followUpRequired: row.followUpRequired,
    progressStatus: row.progressStatus,
  };
}

export async function upsertOwnTechWorkReport(input: {
  appointmentId: string;
  jobId: string;
  staffId: string;
  technicianUserId: string;
  fields: TechWorkReportFields;
  expectedUpdatedAt: string | null;
}): Promise<
  | { ok: true; noop?: boolean; row: TechWorkReportRow }
  | { ok: false; conflict: boolean; error: string }
> {
  const db = dbAdmin();
  const now = new Date().toISOString();
  const payload = {
    appointment_id: input.appointmentId,
    job_id: input.jobId,
    staff_id: input.staffId,
    technician_user_id: input.technicianUserId,
    work_summary: normalizeVisitReportText(input.fields.workSummary),
    outstanding_work: normalizeVisitReportText(input.fields.outstandingWork),
    issues: normalizeVisitReportText(input.fields.issues),
    follow_up_required: Boolean(input.fields.followUpRequired),
    progress_status: input.fields.progressStatus,
    updated_at: now,
  };

  const existing = await getTechWorkReportForTechnician({
    appointmentId: input.appointmentId,
    technicianUserId: input.technicianUserId,
  });

  if (!existing) {
    if (input.expectedUpdatedAt) {
      return {
        ok: false,
        conflict: true,
        error: 'Your work report was updated elsewhere. Refresh the page and try again.',
      };
    }
    const { data, error } = await db
      .from('job_appointment_tech_reports')
      .insert(payload)
      .select(
        'id,appointment_id,job_id,staff_id,technician_user_id,work_summary,outstanding_work,issues,follow_up_required,progress_status,created_at,updated_at',
      )
      .maybeSingle();
    if (error || !data) {
      // Unique race: another insert won — treat as conflict.
      if (error?.code === '23505') {
        return {
          ok: false,
          conflict: true,
          error: 'Your work report was updated elsewhere. Refresh the page and try again.',
        };
      }
      if (isMissingTechReportsRelation(error)) {
        return { ok: false, conflict: false, error: TECH_REPORTS_MIGRATION_REQUIRED };
      }
      return { ok: false, conflict: false, error: 'Unable to save work report.' };
    }
    const names = await nameMapFor([input.technicianUserId]);
    return { ok: true, row: mapRow(data as DbTechReport, names) };
  }

  if ((input.expectedUpdatedAt ?? null) !== existing.updatedAt) {
    return {
      ok: false,
      conflict: true,
      error: 'Your work report was updated elsewhere. Refresh the page and try again.',
    };
  }

  const currentSnap = techWorkReportToSnapshot(existing);
  const proposedSnap: TechWorkReportSnapshot = {
    ...input.fields,
    workSummary: normalizeVisitReportText(input.fields.workSummary),
    outstandingWork: normalizeVisitReportText(input.fields.outstandingWork),
    issues: normalizeVisitReportText(input.fields.issues),
    updatedAt: existing.updatedAt,
  };
  if (
    currentSnap.progressStatus === proposedSnap.progressStatus &&
    normalizeVisitReportText(currentSnap.workSummary) ===
      normalizeVisitReportText(proposedSnap.workSummary) &&
    normalizeVisitReportText(currentSnap.outstandingWork) ===
      normalizeVisitReportText(proposedSnap.outstandingWork) &&
    normalizeVisitReportText(currentSnap.issues) === normalizeVisitReportText(proposedSnap.issues) &&
    Boolean(currentSnap.followUpRequired) === Boolean(proposedSnap.followUpRequired)
  ) {
    return { ok: true, noop: true, row: existing };
  }

  const { data, error } = await db
    .from('job_appointment_tech_reports')
    .update(payload)
    .eq('id', existing.id)
    .eq('technician_user_id', input.technicianUserId)
    .eq('updated_at', existing.updatedAt)
    .select(
      'id,appointment_id,job_id,staff_id,technician_user_id,work_summary,outstanding_work,issues,follow_up_required,progress_status,created_at,updated_at',
    )
    .maybeSingle();
  if (error) {
    if (isMissingTechReportsRelation(error)) {
      return { ok: false, conflict: false, error: TECH_REPORTS_MIGRATION_REQUIRED };
    }
    return { ok: false, conflict: false, error: 'Unable to save work report.' };
  }
  if (!data) {
    return {
      ok: false,
      conflict: true,
      error: 'Your work report was updated elsewhere. Refresh the page and try again.',
    };
  }
  const names = await nameMapFor([input.technicianUserId]);
  return { ok: true, row: mapRow(data as DbTechReport, names) };
}

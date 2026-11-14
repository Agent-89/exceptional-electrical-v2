import 'server-only';
import { dbAdmin } from '@/lib/hq-auth';
import { perthDayBounds, perthDayKey } from '@/lib/perth-day';

export type TechAppointmentRow = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  visitStatus: string;
  fieldStatus: string;
  fieldFollowUpRequired: boolean;
  fieldCompletionNote: string | null;
  fieldOutstandingWork: string | null;
  fieldIssues: string | null;
  visitNotes: string | null;
  jobId: string;
  jobNumber: number;
  title: string;
  description: string | null;
  jobStatus: string;
  siteAddress: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  electricianNames: string[];
};

type JobRow = {
  id: string;
  job_number: number;
  title: string;
  description: string | null;
  status: string;
  site_address_text: string | null;
  customer_id: string | null;
};

type AppointmentRow = {
  id: string;
  job_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  status: string;
  field_status?: string | null;
  field_follow_up_required?: boolean | null;
  field_completion_note?: string | null;
  field_outstanding_work?: string | null;
  field_issues?: string | null;
};

const APPOINTMENT_SELECT =
  'id,job_id,starts_at,ends_at,notes,status,field_status,field_follow_up_required,field_completion_note,field_outstanding_work,field_issues';

async function appointmentIdsForStaff(staffId: string): Promise<string[]> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_appointment_staff')
    .select('appointment_id')
    .eq('staff_id', staffId)
    .limit(2000);
  if (error) throw new Error('Unable to load technician visit assignments.');
  return [...new Set((data ?? []).map((r) => r.appointment_id as string))];
}

async function hydrateFromAppointments(
  appointments: AppointmentRow[],
): Promise<TechAppointmentRow[]> {
  if (!appointments.length) return [];
  const db = dbAdmin();
  const jobIds = [...new Set(appointments.map((a) => a.job_id))];
  const appointmentIds = appointments.map((a) => a.id);

  const [{ data: jobs }, { data: crewLinks }] = await Promise.all([
    db
      .from('jobs')
      .select('id,job_number,title,description,status,site_address_text,customer_id')
      .in('id', jobIds),
    db
      .from('job_appointment_staff')
      .select('appointment_id,scheduling_staff(full_name)')
      .in('appointment_id', appointmentIds),
  ]);

  const jobMap = new Map((jobs ?? []).map((j) => [j.id as string, j as JobRow]));
  const customerIds = [
    ...new Set(
      [...jobMap.values()]
        .map((j) => j.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: customers } = customerIds.length
    ? await db.from('customers').select('id,name,phone').in('id', customerIds)
    : { data: [] as { id: string; name: string; phone: string | null }[] };
  const customerMap = new Map((customers ?? []).map((c) => [c.id, c]));

  const namesByAppt = new Map<string, string[]>();
  for (const link of crewLinks ?? []) {
    const raw = link.scheduling_staff as { full_name: string } | { full_name: string }[] | null;
    const staff = Array.isArray(raw) ? raw[0] : raw;
    if (!staff?.full_name) continue;
    const list = namesByAppt.get(link.appointment_id) ?? [];
    list.push(staff.full_name);
    namesByAppt.set(link.appointment_id, list);
  }

  return appointments
    .map((appt) => {
      const job = jobMap.get(appt.job_id);
      if (!job) return null;
      const customer = job.customer_id ? customerMap.get(job.customer_id) : null;
      return {
        appointmentId: appt.id,
        startsAt: appt.starts_at,
        endsAt: appt.ends_at,
        visitStatus: appt.status,
        fieldStatus: appt.field_status ?? 'scheduled',
        fieldFollowUpRequired: Boolean(appt.field_follow_up_required),
        fieldCompletionNote: appt.field_completion_note ?? null,
        fieldOutstandingWork: appt.field_outstanding_work ?? null,
        fieldIssues: appt.field_issues ?? null,
        visitNotes: appt.notes,
        jobId: job.id,
        jobNumber: job.job_number,
        title: job.title,
        description: job.description,
        jobStatus: job.status,
        siteAddress: job.site_address_text,
        customerId: job.customer_id,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        electricianNames: namesByAppt.get(appt.id) ?? [],
      } satisfies TechAppointmentRow;
    })
    .filter((row): row is TechAppointmentRow => Boolean(row))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Appointments assigned to this crew member via job_appointment_staff. */
export async function listTechnicianAppointments(
  staffId: string,
  options?: { from?: Date; to?: Date; statuses?: string[]; limit?: number },
): Promise<TechAppointmentRow[]> {
  const ids = await appointmentIdsForStaff(staffId);
  if (!ids.length) return [];

  const db = dbAdmin();
  const applyFilters = (select: string) => {
    let query = db.from('job_appointments').select(select).in('id', ids);
    if (options?.from) query = query.gte('starts_at', options.from.toISOString());
    if (options?.to) query = query.lt('starts_at', options.to.toISOString());
    if (options?.statuses?.length) query = query.in('status', options.statuses);
    return query.order('starts_at', { ascending: true }).limit(options?.limit ?? 200);
  };

  const primary = await applyFilters(APPOINTMENT_SELECT);
  const result = primary.error
    ? await applyFilters('id,job_id,starts_at,ends_at,notes,status')
    : primary;
  if (result.error) throw new Error('Unable to load technician appointments.');
  return hydrateFromAppointments((result.data ?? []) as unknown as AppointmentRow[]);
}

export async function getTechnicianAppointment(
  staffId: string,
  appointmentId: string,
): Promise<TechAppointmentRow | null> {
  const db = dbAdmin();
  const { data: link, error: linkError } = await db
    .from('job_appointment_staff')
    .select('appointment_id')
    .eq('staff_id', staffId)
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  if (linkError) throw new Error('Unable to verify appointment access.');
  if (!link) return null;

  const primary = await db
    .from('job_appointments')
    .select(APPOINTMENT_SELECT)
    .eq('id', appointmentId)
    .maybeSingle();
  const fallback = primary.error
    ? await db
        .from('job_appointments')
        .select('id,job_id,starts_at,ends_at,notes,status')
        .eq('id', appointmentId)
        .maybeSingle()
    : primary;
  if (fallback.error) throw new Error('Unable to load appointment.');
  if (!fallback.data) return null;
  const rows = await hydrateFromAppointments([fallback.data as unknown as AppointmentRow]);
  return rows[0] ?? null;
}

/** Active field visits still belong on the technician calendar even if scheduling status changes later. */
const TECH_CALENDAR_STATUSES = ['scheduled', 'completed'] as const;

export async function listTechnicianDaySchedule(
  staffId: string,
  dayKey: string,
): Promise<TechAppointmentRow[]> {
  const { start, end } = perthDayBounds(dayKey);
  return listTechnicianAppointments(staffId, {
    from: start,
    to: end,
    statuses: [...TECH_CALENDAR_STATUSES],
    limit: 80,
  });
}

export async function listTechnicianTodayAndUpcoming(staffId: string): Promise<{
  todayKey: string;
  today: TechAppointmentRow[];
  upcoming: TechAppointmentRow[];
}> {
  const todayKey = perthDayKey();
  const { start: todayStart, end: todayEnd } = perthDayBounds(todayKey);
  const horizon = new Date(todayEnd.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [today, upcoming] = await Promise.all([
    listTechnicianAppointments(staffId, {
      from: todayStart,
      to: todayEnd,
      statuses: [...TECH_CALENDAR_STATUSES],
      limit: 50,
    }),
    listTechnicianAppointments(staffId, {
      from: todayEnd,
      to: horizon,
      statuses: ['scheduled'],
      limit: 50,
    }),
  ]);

  return { todayKey, today, upcoming };
}

/** Distinct jobs that have at least one appointment assigned to this crew member. */
export async function listTechnicianJobs(staffId: string): Promise<
  {
    jobId: string;
    jobNumber: number;
    title: string;
    jobStatus: string;
    siteAddress: string | null;
    customerName: string | null;
    nextVisit: TechAppointmentRow | null;
    visitCount: number;
  }[]
> {
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const rows = await listTechnicianAppointments(staffId, {
    from,
    to,
    statuses: ['scheduled', 'completed'],
    limit: 300,
  });

  const byJob = new Map<string, TechAppointmentRow[]>();
  for (const row of rows) {
    const list = byJob.get(row.jobId) ?? [];
    list.push(row);
    byJob.set(row.jobId, list);
  }

  return [...byJob.entries()]
    .map(([, visits]) => {
      const nextVisit =
        visits.find((v) => v.visitStatus === 'scheduled' && new Date(v.endsAt) >= now) ??
        visits.find((v) => v.visitStatus === 'scheduled') ??
        null;
      const sample = nextVisit ?? visits[0];
      return {
        jobId: sample.jobId,
        jobNumber: sample.jobNumber,
        title: sample.title,
        jobStatus: sample.jobStatus,
        siteAddress: sample.siteAddress,
        customerName: sample.customerName,
        nextVisit,
        visitCount: visits.length,
      };
    })
    .sort((a, b) => {
      const aStart = a.nextVisit?.startsAt ?? '9999';
      const bStart = b.nextVisit?.startsAt ?? '9999';
      return aStart.localeCompare(bStart);
    });
}

export async function listAuthorizedJobVisits(
  staffId: string,
  jobId: string,
): Promise<{ sample: TechAppointmentRow | null; visits: TechAppointmentRow[] }> {
  const ids = await appointmentIdsForStaff(staffId);
  if (!ids.length) return { sample: null, visits: [] };

  const db = dbAdmin();
  const primary = await db
    .from('job_appointments')
    .select(APPOINTMENT_SELECT)
    .eq('job_id', jobId)
    .in('id', ids)
    .order('starts_at', { ascending: true })
    .limit(100);
  const result = primary.error
    ? await db
        .from('job_appointments')
        .select('id,job_id,starts_at,ends_at,notes,status')
        .eq('job_id', jobId)
        .in('id', ids)
        .order('starts_at', { ascending: true })
        .limit(100)
    : primary;
  if (result.error) throw new Error('Unable to load job visits.');
  const visits = await hydrateFromAppointments((result.data ?? []) as unknown as AppointmentRow[]);
  return { sample: visits[0] ?? null, visits };
}

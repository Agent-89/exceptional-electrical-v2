import 'server-only';
import { dbAdmin } from '@/lib/hq-auth';
import { shiftPerthDayKey, sumAppointmentHours } from '@/lib/hq-dashboard-metrics';
import { isMissingInvoiceSchemaError } from '@/lib/invoice-commercial';
import {
  formatJobNumber,
  formatPerthTime,
  perthDayBounds,
  perthDayKey,
} from '@/lib/perth-day';

export {
  formatDashboardHours,
  shiftPerthDayKey,
  sumAppointmentHours,
} from '@/lib/hq-dashboard-metrics';

export type DashboardDayPulse = {
  dayKey: string;
  visitCount: number;
  jobCount: number;
  hours: number;
};

export type DashboardTodayVisit = {
  appointmentId: string;
  jobId: string;
  jobNumberLabel: string;
  title: string;
  customerName: string;
  crewLabel: string;
  statusLabel: string;
  timeRange: string;
  href: string;
  startsAt: string;
};

export type DashboardAttention = {
  newEnquiries: number | null;
  pendingQuotes: number | null;
  draftInvoices: number | null;
  overdueInvoices: number | null;
  invoicesAvailable: boolean;
};

export type DashboardActivityItem = {
  id: string;
  href: string;
  title: string;
  detail: string;
  label: string;
};

export type HqDashboardData = {
  today: DashboardDayPulse;
  tomorrow: DashboardDayPulse;
  todayVisits: DashboardTodayVisit[];
  attention: DashboardAttention;
  activity: DashboardActivityItem[];
  hasErrors: boolean;
};

type AppointmentRow = {
  id: string;
  job_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  field_status?: string | null;
};

type JobRow = {
  id: string;
  job_number: number;
  title: string;
  customer_id: string | null;
  status: string;
};

const TODAY_LIST_LIMIT = 8;
const ACTIVITY_LIMIT = 4;

function pulseFromAppointments(dayKey: string, rows: AppointmentRow[]): DashboardDayPulse {
  const jobIds = new Set(rows.map((r) => r.job_id));
  return {
    dayKey,
    visitCount: rows.length,
    jobCount: jobIds.size,
    hours: sumAppointmentHours(rows),
  };
}

function statusLabelForVisit(row: AppointmentRow, jobStatus: string | undefined): string {
  const field = (row.field_status || '').trim().toLowerCase();
  if (field && field !== 'scheduled') {
    return field.replaceAll('_', ' ');
  }
  if (jobStatus) return jobStatus.replaceAll('_', ' ');
  return row.status.replaceAll('_', ' ');
}

async function loadDayAppointments(dayKey: string): Promise<{
  rows: AppointmentRow[];
  error: boolean;
}> {
  const db = dbAdmin();
  const { start, end } = perthDayBounds(dayKey);
  const { data, error } = await db
    .from('job_appointments')
    .select('id,job_id,starts_at,ends_at,status,field_status')
    .eq('status', 'scheduled')
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
    .order('starts_at', { ascending: true })
    .limit(200);
  if (error) return { rows: [], error: true };
  return { rows: (data ?? []) as AppointmentRow[], error: false };
}

async function hydrateTodayVisits(rows: AppointmentRow[]): Promise<{
  visits: DashboardTodayVisit[];
  error: boolean;
}> {
  if (!rows.length) return { visits: [], error: false };
  const db = dbAdmin();
  const limited = rows.slice(0, TODAY_LIST_LIMIT);
  const jobIds = [...new Set(limited.map((r) => r.job_id))];
  const appointmentIds = limited.map((r) => r.id);

  const [{ data: jobs, error: jobsError }, { data: crewLinks, error: crewError }] =
    await Promise.all([
      db
        .from('jobs')
        .select('id,job_number,title,customer_id,status')
        .in('id', jobIds),
      db
        .from('job_appointment_staff')
        .select('appointment_id,scheduling_staff(full_name)')
        .in('appointment_id', appointmentIds),
    ]);

  if (jobsError || crewError) {
    return { visits: [], error: true };
  }

  const jobMap = new Map((jobs ?? []).map((j) => [j.id as string, j as JobRow]));
  const customerIds = [
    ...new Set(
      [...jobMap.values()]
        .map((j) => j.customer_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: customers, error: customersError } = customerIds.length
    ? await db.from('customers').select('id,name').in('id', customerIds)
    : { data: [] as { id: string; name: string }[], error: null };

  if (customersError) return { visits: [], error: true };

  const customerMap = new Map((customers ?? []).map((c) => [c.id as string, c.name as string]));
  const namesByAppt = new Map<string, string[]>();
  for (const link of crewLinks ?? []) {
    const raw = link.scheduling_staff as
      | { full_name: string }
      | { full_name: string }[]
      | null;
    const staff = Array.isArray(raw) ? raw[0] : raw;
    if (!staff?.full_name) continue;
    const list = namesByAppt.get(link.appointment_id) ?? [];
    list.push(staff.full_name);
    namesByAppt.set(link.appointment_id, list);
  }

  const visits = limited.map((row) => {
    const job = jobMap.get(row.job_id);
    const crew = namesByAppt.get(row.id) ?? [];
    return {
      appointmentId: row.id,
      jobId: row.job_id,
      jobNumberLabel: formatJobNumber(job?.job_number ?? 0),
      title: job?.title || 'Job',
      customerName: job?.customer_id
        ? customerMap.get(job.customer_id) || 'Customer'
        : 'No customer',
      crewLabel: crew.length ? crew.join(', ') : 'Unassigned',
      statusLabel: statusLabelForVisit(row, job?.status),
      timeRange: `${formatPerthTime(row.starts_at)} – ${formatPerthTime(row.ends_at)}`,
      href: `/hq/jobs/${row.job_id}`,
      startsAt: row.starts_at,
    } satisfies DashboardTodayVisit;
  });

  return { visits, error: false };
}

async function loadAttention(): Promise<{ attention: DashboardAttention; error: boolean }> {
  const db = dbAdmin();
  const todayKey = perthDayKey();

  const [enquiries, quotes, drafts, overdue] = await Promise.all([
    db.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    db
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending_approval'),
    db.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    db
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .in('status', ['approved', 'sent', 'part_paid'])
      .lt('due_date', todayKey)
      .not('due_date', 'is', null),
  ]);

  const invoiceMissing =
    isMissingInvoiceSchemaError(drafts.error) || isMissingInvoiceSchemaError(overdue.error);
  const invoiceError = Boolean(
    (drafts.error && !isMissingInvoiceSchemaError(drafts.error)) ||
      (overdue.error && !isMissingInvoiceSchemaError(overdue.error)),
  );
  const coreError = Boolean(enquiries.error || quotes.error || invoiceError);

  return {
    attention: {
      newEnquiries: enquiries.error ? null : (enquiries.count ?? 0),
      pendingQuotes: quotes.error ? null : (quotes.count ?? 0),
      draftInvoices: invoiceMissing || drafts.error ? null : (drafts.count ?? 0),
      overdueInvoices: invoiceMissing || overdue.error ? null : (overdue.count ?? 0),
      invoicesAvailable: !invoiceMissing,
    },
    error: coreError,
  };
}

async function loadActivity(): Promise<{ items: DashboardActivityItem[]; error: boolean }> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('quotes')
    .select('id,quote_number,title,status,updated_at')
    .order('updated_at', { ascending: false })
    .limit(ACTIVITY_LIMIT);

  if (error) return { items: [], error: true };

  const items = ((data ?? []) as Array<{
    id: string;
    quote_number: string;
    title: string | null;
    status: string;
    updated_at: string;
  }>).map((q) => ({
    id: q.id,
    href: `/hq/quotes/${q.id}`,
    title: `${q.quote_number} · ${q.title || 'Untitled quote'}`,
    detail: `Updated ${new Date(q.updated_at).toLocaleDateString('en-AU', {
      timeZone: 'Australia/Perth',
    })}`,
    label: q.status.replaceAll('_', ' '),
  }));

  return { items, error: false };
}

/** Office-wide owner Home dashboard payload (read-only). */
export async function loadHqDashboard(): Promise<HqDashboardData> {
  const todayKey = perthDayKey();
  const tomorrowKey = shiftPerthDayKey(todayKey, 1);

  const [todayAppts, tomorrowAppts, attentionResult, activityResult] = await Promise.all([
    loadDayAppointments(todayKey),
    loadDayAppointments(tomorrowKey),
    loadAttention(),
    loadActivity(),
  ]);

  const hydrated = await hydrateTodayVisits(todayAppts.rows);

  return {
    today: pulseFromAppointments(todayKey, todayAppts.rows),
    tomorrow: pulseFromAppointments(tomorrowKey, tomorrowAppts.rows),
    todayVisits: hydrated.visits,
    attention: attentionResult.attention,
    activity: activityResult.items,
    hasErrors:
      todayAppts.error ||
      tomorrowAppts.error ||
      hydrated.error ||
      attentionResult.error ||
      activityResult.error,
  };
}

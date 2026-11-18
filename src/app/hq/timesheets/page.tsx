import { dbAdmin, requireOfficeUser } from '@/lib/hq-auth';
import { perthDayKey } from '@/lib/perth-day';
import {
  buildTimesheetWeekRows,
  matchesTimesheetStatusFilter,
  perthWeekBounds,
  perthWeekDateKeys,
  resolveTimesheetStatusFilter,
  resolveTimesheetWeekMonday,
  sortTimesheetEntriesForReview,
} from '@/lib/timesheet-week';
import TimesheetWeekGrid from './week-grid';
import TimesheetEntriesTable, { type TimesheetEntryRow } from './entries-table';
import '../hq.css';

export const dynamic = 'force-dynamic';

type EntryRow = {
  id: string;
  job_id: string;
  appointment_id: string | null;
  staff_id: string;
  technician_user_id: string;
  started_at: string;
  ended_at: string | null;
  break_minutes: number;
  worked_minutes: number | null;
  billable_minutes: number | null;
  status: string;
  entry_source: string;
  note: string | null;
  rejection_reason: string | null;
  correction_note: string | null;
  original_worked_minutes: number | null;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    staff?: string;
    job?: string;
    status?: string;
    day?: string;
  }>;
}) {
  await requireOfficeUser();
  const params = await searchParams;
  const db = dbAdmin();

  const todayKey = perthDayKey();
  const mondayKey = resolveTimesheetWeekMonday(params.week, todayKey);
  const weekDateKeys = perthWeekDateKeys(mondayKey);
  const { start: weekStart, end: weekEnd } = perthWeekBounds(mondayKey);

  const staffFilter = params.staff && UUID_RE.test(params.staff) ? params.staff : '';
  const jobFilter = params.job && UUID_RE.test(params.job) ? params.job : '';
  const statusFilter = resolveTimesheetStatusFilter(params.status);
  const dayFilter = params.day && DATE_RE.test(params.day) ? params.day : '';

  const [{ data: entries, error }, { data: staff }, { data: jobs }] = await Promise.all([
    db
      .from('job_time_entries')
      .select(
        'id,job_id,appointment_id,staff_id,technician_user_id,started_at,ended_at,break_minutes,worked_minutes,billable_minutes,status,entry_source,note,rejection_reason,correction_note,original_worked_minutes',
      )
      .gte('started_at', weekStart.toISOString())
      .lt('started_at', weekEnd.toISOString())
      .neq('status', 'cancelled')
      .order('started_at', { ascending: false })
      .limit(500),
    db
      .from('scheduling_staff')
      .select('id,full_name,initials,avatar_color')
      .eq('active', true)
      .order('full_name'),
    db.from('jobs').select('id,job_number,title').order('job_number', { ascending: false }).limit(500),
  ]);

  const list = (entries ?? []) as EntryRow[];
  const staffList = (staff ?? []).map((s) => ({
    id: s.id as string,
    fullName: s.full_name as string,
    initials: (s.initials as string | null) ?? null,
    avatarColor: (s.avatar_color as string | null) ?? null,
  }));
  const staffMap = new Map(staffList.map((s) => [s.id, s.fullName]));
  const jobOptions = (jobs ?? []).map((j) => ({
    id: j.id as string,
    number: j.job_number as number,
    title: j.title as string,
  }));
  const jobMap = new Map(jobOptions.map((j) => [j.id, j]));

  const weekRows = buildTimesheetWeekRows(
    staffList,
    list.map((entry) => ({
      staffId: entry.staff_id,
      startedAt: entry.started_at,
      workedMinutes: entry.worked_minutes,
      billableMinutes: entry.billable_minutes,
      status: entry.status,
    })),
    weekDateKeys,
  );

  const filtered = sortTimesheetEntriesForReview(
    list
      .filter((entry) => {
        if (staffFilter && entry.staff_id !== staffFilter) return false;
        if (jobFilter && entry.job_id !== jobFilter) return false;
        if (dayFilter && perthDayKey(entry.started_at) !== dayFilter) return false;
        if (!matchesTimesheetStatusFilter(entry.status, statusFilter)) return false;
        return true;
      })
      .map((entry) => ({
        ...entry,
        startedAt: entry.started_at,
      })),
  );

  const tableRows: TimesheetEntryRow[] = filtered.map((entry) => {
    const job = jobMap.get(entry.job_id);
    return {
      id: entry.id,
      jobId: entry.job_id,
      staffId: entry.staff_id,
      staffName: staffMap.get(entry.staff_id) ?? 'Technician',
      jobNumber: job?.number ?? null,
      jobTitle: job?.title ?? null,
      startedAt: entry.started_at,
      endedAt: entry.ended_at,
      breakMinutes: entry.break_minutes,
      workedMinutes: entry.worked_minutes,
      billableMinutes: entry.billable_minutes,
      status: entry.status,
      entrySource: entry.entry_source,
      note: entry.note,
      rejectionReason: entry.rejection_reason,
      correctionNote: entry.correction_note,
      originalWorkedMinutes: entry.original_worked_minutes,
    };
  });

  const dayLabel = dayFilter
    ? new Date(dayFilter + 'T12:00:00+08:00').toLocaleDateString('en-AU', {
        timeZone: 'Australia/Perth',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : undefined;

  return (
    <main className="hq-detail">
      <div className="hq-detail-inner ee-workspace">
        <header className="ee-workspace-head">
          <div>
            <div className="hq-kicker">OFFICE · TIME</div>
            <h1>Timesheets</h1>
          </div>
        </header>

        {error ? (
          <p className="ee-tech-alert ee-tech-alert-error" role="alert">
            Unable to load timesheets. Apply the Milestone 2 migration locally first.
          </p>
        ) : null}

        <TimesheetWeekGrid
          mondayKey={mondayKey}
          rows={weekRows}
          jobFilter={jobFilter || undefined}
          statusFilter={statusFilter}
        />

        <TimesheetEntriesTable
          entries={tableRows}
          mondayKey={mondayKey}
          staffFilter={staffFilter}
          jobFilter={jobFilter}
          statusFilter={statusFilter}
          dayFilter={dayFilter}
          staffOptions={staffList.map((s) => ({ id: s.id, fullName: s.fullName }))}
          jobOptions={jobOptions}
          dayLabel={dayLabel}
          staffLabel={staffFilter ? staffMap.get(staffFilter) : undefined}
        />
      </div>
      <style>{`
.ee-workspace-head{margin-bottom:18px}
.ee-muted{color:#738396}
.ee-eyebrow{color:#1688e9;font-size:11px;font-weight:800;letter-spacing:.12em}
.ee-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
.ee-section-title h2{margin:5px 0 0;font-size:22px}
.ee-compact-panel{padding:22px;margin-bottom:12px;overflow:hidden}
.ee-timesheet-entries-table a,.ee-timesheet-staff{color:#0875c9;text-decoration:none;font-weight:700}
.ee-timesheet-actions,.ee-review-actions{display:flex;flex-wrap:wrap;gap:8px}
.ee-review-btn{appearance:none;-webkit-appearance:none;border:1px solid #d4e1ed;border-radius:10px;background:#fff;color:#17364b;padding:10px 14px;min-height:44px;cursor:pointer;font:inherit;font-size:14px;font-weight:800;line-height:1.2;color-scheme:light}
.ee-review-btn:disabled{opacity:.6;cursor:wait}
.ee-review-btn-approve{background:#1688e9;border-color:#1688e9;color:#fff}
.ee-review-btn-reject{background:#fff;border-color:#f0b4b4;color:#b42318}
.ee-review-btn-correct{background:#fff;border-color:#9bcbf4;color:#076ab5}
.ee-review-btn-cancel{background:#edf4fa;border-color:#d4e1ed;color:#31536c}
.ee-form-error{margin:0;color:#b42318;font-size:13px;font-weight:700}
.ee-form-success{margin:0 0 10px;color:#0875c9;font-size:13px;font-weight:700}
.ee-time-calc{display:grid;gap:4px}
.ee-time-calc p{margin:0}
.ee-billable-mode{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:-6px}
.ee-billable-manual{color:#9a3412;font-size:13px;font-weight:700}
.ee-timesheet-week-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px}
.ee-timesheet-week-head h2{margin:4px 0 0;font-size:1.25rem}
.ee-timesheet-week-nav{display:flex;gap:6px;align-items:center}
.ee-timesheet-week-nav-btn{display:grid;place-items:center;min-width:40px;height:40px;padding:0 12px;border:1px solid #d4e1ed;border-radius:10px;background:#fff;color:#17364b;font-weight:800;text-decoration:none}
.ee-job-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:8px}
.ee-job-table{width:100%;border-collapse:collapse;font-size:13px}
.ee-job-table th,.ee-job-table td{text-align:left;padding:8px 10px;border-bottom:1px solid #e1e8f0;vertical-align:top}
.ee-job-table th{font-size:11px;letter-spacing:.04em;color:#647d91;font-weight:800}
.ee-job-table tbody th{font-size:13px;letter-spacing:0;color:#10233a;font-weight:700}
.ee-timesheet-week-wrap{overflow:auto}
.ee-timesheet-week-table{min-width:720px;border-collapse:separate;border-spacing:0}
.ee-timesheet-week-table th,.ee-timesheet-week-table td{text-align:center;vertical-align:middle;background:#fff}
.ee-timesheet-week-table th:first-child,.ee-timesheet-week-table td:first-child,.ee-timesheet-week-table tbody th{text-align:left}
.ee-timesheet-sticky-col{position:sticky;left:0;z-index:2;background:#fff;min-width:11rem;max-width:14rem;box-shadow:1px 0 0 #e1e8f0}
.ee-timesheet-week-table thead .ee-timesheet-sticky-col{z-index:3}
.ee-timesheet-day-label{display:block;font-size:12px;color:#647d91;font-weight:700}
.ee-timesheet-day-date{display:block;font-size:11px;color:#8aa0b2;font-weight:600}
.ee-timesheet-staff{display:inline-flex;align-items:center;gap:10px;color:inherit;max-width:100%}
.ee-timesheet-staff-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ee-timesheet-avatar{display:grid;place-items:center;width:32px;height:32px;border-radius:999px;color:#fff;font-size:11px;font-weight:800;flex:none}
.ee-timesheet-day-cell{display:grid;justify-items:center;gap:4px;min-height:44px;padding:6px 4px;border-radius:8px;text-decoration:none;color:#17364b;font-weight:700}
.ee-timesheet-day-cell:hover{background:#eef6fc}
.ee-timesheet-day-cell.is-empty{color:#94a3b8;font-weight:600}
.ee-timesheet-day-main{font-variant-numeric:tabular-nums}
.ee-timesheet-pending-hint{display:inline-grid;place-items:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#fff4e4;border:1px solid #e4b16d;color:#865a1a;font-size:10px;font-weight:800;line-height:1}
.ee-timesheet-total{font-variant-numeric:tabular-nums;font-weight:800;color:#17364b}
.ee-timesheet-entries-filters{display:grid;gap:10px;margin:0 0 14px}
.ee-timesheet-status-chips{display:flex;flex-wrap:wrap;gap:6px}
.ee-timesheet-status-chip{display:inline-flex;align-items:center;min-height:30px;padding:4px 10px;border:1px solid #d4e1ed;border-radius:999px;background:#fff;color:#31536c;font-size:12px;font-weight:700;text-decoration:none}
.ee-timesheet-status-chip.is-active{background:#e7f3ff;border-color:#9bcbf4;color:#076ab5}
.ee-timesheet-filter-selects{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ee-timesheet-mini-filter{display:inline-flex;align-items:center;gap:6px;margin:0;font-size:12px;font-weight:700;color:#647d91}
.ee-timesheet-mini-label{flex:none}
.ee-timesheet-mini-filter select{min-height:32px;max-width:11rem;padding:4px 8px;border:1px solid #cbd8e6;border-radius:8px;font:inherit;font-size:13px;font-weight:600;color:#17364b;background:#fff}
.ee-timesheet-clear{font-size:12px}
.ee-timesheet-day-hint{margin:0;font-size:12px}
.ee-timesheet-entries-wrap{overflow:auto}
.ee-timesheet-entries-table{min-width:960px}
.ee-timesheet-entries-table tbody tr.ee-time-pending-row{background:#fff7eb}
.ee-timesheet-entries-table th,.ee-timesheet-entries-table td{vertical-align:middle}
.ee-timesheet-entries-table td:last-child{min-width:11.5rem;white-space:normal}
.ee-timesheet-status{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.02em}
.ee-timesheet-status-pending{color:#9a3412}
.ee-timesheet-status-approved{color:#15803d}
.ee-timesheet-status-rejected{color:#b42318}
.ee-timesheet-status-live{color:#17669e}
.ee-timesheet-status-neutral{color:#31536c}
.ee-timesheet-review-notes{display:grid;gap:3px;margin-top:5px;max-width:14rem}
.ee-timesheet-review-note{margin:0;font-size:11px;line-height:1.35;color:#647d91;font-weight:600;overflow-wrap:anywhere}
.ee-timesheet-review-note-rejection{color:#9f1239}
.ee-timesheet-review-note-correction{color:#9a3412}
.ee-timesheet-row-actions{display:flex;flex-wrap:nowrap;gap:8px;align-items:center}
.ee-timesheet-approve{border:1px solid #1688e9;border-radius:7px;background:#1688e9;color:#fff;padding:5px 9px;min-height:30px;cursor:pointer;font:inherit;font-size:12px;font-weight:800;white-space:nowrap}
.ee-timesheet-approve:disabled{opacity:.6;cursor:wait}
.ee-timesheet-edit{font-size:12px;white-space:nowrap}
.ee-text-action{border:0;background:transparent;color:#0875c9;font-weight:700;cursor:pointer;padding:0;text-decoration:none}
.ee-time-row-feedback{margin-top:6px}
.ee-timesheet-dialog{width:min(560px,calc(100vw - 28px));max-height:min(88dvh,900px);border:1px solid #dce5ee;border-radius:16px;padding:0;background:#fff;color:#17364b;box-shadow:0 25px 75px #102b4860}
.ee-timesheet-dialog::backdrop{background:#15344c88}
.ee-timesheet-correct-dialog{width:min(640px,calc(100vw - 28px))}
.ee-timesheet-dialog-body{padding:18px 22px;display:grid;gap:14px;overflow:auto;max-height:min(88dvh,900px)}
.ee-timesheet-dialog-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.ee-timesheet-dialog-head strong{font-size:18px}
.ee-timesheet-dialog-head p{margin:4px 0 0;font-size:13px;color:#647d91}
.ee-timesheet-dialog-head button{display:grid;place-items:center;border:0;border-radius:10px;background:#edf4fa;color:#31536c;font-size:28px;line-height:1;width:40px;height:40px;cursor:pointer}
.ee-timesheet-dialog-body label{display:grid;gap:6px;font-size:13px;font-weight:700}
.ee-timesheet-dialog-body textarea,.ee-timesheet-dialog-body input{min-height:42px;padding:10px;border:1px solid #cbd8e6;border-radius:10px;font:inherit;font-size:16px}
.ee-timesheet-dialog-body textarea{min-height:88px;resize:vertical}
.ee-timesheet-dialog-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.ee-timesheet-dialog-cancel{border:1px solid #d4e1ed;border-radius:8px;background:#fff;color:#31536c;padding:10px 14px;cursor:pointer;font-weight:700}
.ee-timesheet-dialog-actions .hq-detail-action-primary{background:#1688e9;border:1px solid #1688e9;color:#fff;border-radius:8px;padding:10px 14px;cursor:pointer;font-weight:800}
.ee-edit-form.ee-time-inline-form,.ee-time-inline-form{display:grid;gap:12px}
@media (max-width:900px){
  .ee-timesheet-week-table th:nth-child(n+2):nth-child(-n+8),.ee-timesheet-week-table td:nth-child(n+2):nth-child(-n+8){min-width:4.5rem}
  .ee-timesheet-sticky-col{min-width:3.25rem;max-width:3.5rem;padding-left:8px;padding-right:8px;text-align:center}
  .ee-timesheet-week-table thead .ee-timesheet-sticky-col{font-size:10px;letter-spacing:.02em}
  .ee-timesheet-staff{justify-content:center;gap:0}
  .ee-timesheet-staff-name{display:none}
  .ee-timesheet-avatar{width:34px;height:34px}
  .ee-compact-panel{padding:16px}
  .ee-timesheet-mini-filter select{max-width:9.5rem}
  .ee-timesheet-actions,.ee-review-actions{gap:8px}
  .ee-review-btn{flex:1 1 calc(50% - 8px);min-width:8.5rem;text-align:center}
}
`}</style>
    </main>
  );
}

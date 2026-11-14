import Link from 'next/link';
import { dbAdmin, requireOfficeUser } from '@/lib/hq-auth';
import { formatJobNumber } from '@/lib/perth-day';
import { formatDurationMinutes } from '@/lib/tech-time-format';
import { reviewTimeEntryAction } from '@/app/hq/tech/actions';
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
  original_worked_minutes: number | null;
};

function perthInputValue(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Australia/Perth', hour12: false })
    .replace(' ', 'T')
    .slice(0, 16);
}

export default async function TimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    staff?: string;
    job?: string;
    status?: string;
  }>;
}) {
  await requireOfficeUser();
  const params = await searchParams;
  const db = dbAdmin();

  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const defaultFrom = new Date(todayKey + 'T00:00:00+08:00');
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 14);
  const fromKey =
    params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)
      ? params.from
      : new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Australia/Perth',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(defaultFrom);
  const toKey = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : todayKey;
  const fromIso = new Date(fromKey + 'T00:00:00+08:00').toISOString();
  const toIso = new Date(toKey + 'T00:00:00+08:00').getTime() + 24 * 60 * 60 * 1000;

  let query = db
    .from('job_time_entries')
    .select(
      'id,job_id,appointment_id,staff_id,technician_user_id,started_at,ended_at,break_minutes,worked_minutes,billable_minutes,status,entry_source,note,original_worked_minutes',
    )
    .gte('started_at', fromIso)
    .lt('started_at', new Date(toIso).toISOString())
    .neq('status', 'cancelled')
    .order('started_at', { ascending: false })
    .limit(300);

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.staff && /^[0-9a-f-]{36}$/i.test(params.staff)) query = query.eq('staff_id', params.staff);
  if (params.job && /^[0-9a-f-]{36}$/i.test(params.job)) query = query.eq('job_id', params.job);

  const [{ data: entries, error }, { data: staff }, { data: jobs }] = await Promise.all([
    query,
    db.from('scheduling_staff').select('id,full_name').eq('active', true).order('full_name'),
    db.from('jobs').select('id,job_number,title').order('job_number', { ascending: false }).limit(500),
  ]);

  const list = (entries ?? []) as EntryRow[];
  const staffMap = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));
  const jobMap = new Map(
    (jobs ?? []).map((j) => [
      j.id as string,
      { number: j.job_number as number, title: j.title as string },
    ]),
  );

  return (
    <main className="hq-detail">
      <div className="hq-detail-inner ee-workspace">
        <header className="ee-workspace-head">
          <div>
            <div className="hq-kicker">OFFICE · TIME</div>
            <h1>Timesheets</h1>
            <p>Review submitted field time. Worked minutes stay separate from billable minutes.</p>
          </div>
        </header>

        {error ? (
          <p className="ee-tech-alert ee-tech-alert-error" role="alert">
            Unable to load timesheets. Apply the Milestone 2 migration locally first.
          </p>
        ) : null}

        <section className="hq-panel ee-compact-panel">
          <form className="ee-timesheet-filters" method="get">
            <label>
              From
              <input type="date" name="from" defaultValue={fromKey} />
            </label>
            <label>
              To
              <input type="date" name="to" defaultValue={toKey} />
            </label>
            <label>
              Technician
              <select name="staff" defaultValue={params.staff ?? ''}>
                <option value="">All</option>
                {(staff ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Job
              <select name="job" defaultValue={params.job ?? ''}>
                <option value="">All</option>
                {(jobs ?? []).map((j) => (
                  <option key={j.id} value={j.id}>
                    {formatJobNumber(j.job_number as number)} · {j.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={params.status ?? 'submitted'}>
                <option value="all">All</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="corrected">Corrected</option>
                <option value="active">Active</option>
                <option value="on_break">On break</option>
              </select>
            </label>
            <button type="submit" className="hq-detail-action-primary">
              Apply filters
            </button>
          </form>
        </section>

        <section className="hq-panel ee-compact-panel">
          <div className="ee-section-title">
            <div>
              <span className="ee-eyebrow">ENTRIES</span>
              <h2>{list.length} results</h2>
            </div>
          </div>
          {list.length === 0 ? (
            <p className="ee-muted">No time entries match these filters.</p>
          ) : (
            list.map((entry) => {
              const job = jobMap.get(entry.job_id);
              const canReview = ['submitted', 'rejected', 'corrected', 'approved'].includes(entry.status);
              return (
                <article className="ee-timesheet-row" key={entry.id}>
                  <div>
                    <strong>
                      {staffMap.get(entry.staff_id) ?? 'Technician'} ·{' '}
                      {formatDurationMinutes(entry.worked_minutes ?? 0)} worked
                    </strong>
                    <p>
                      {job ? (
                        <Link href={'/hq/jobs/' + entry.job_id}>
                          {formatJobNumber(job.number)} · {job.title}
                        </Link>
                      ) : (
                        entry.job_id
                      )}
                    </p>
                    <p>
                      {new Date(entry.started_at).toLocaleString('en-AU', {
                        timeZone: 'Australia/Perth',
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {entry.ended_at
                        ? ' – ' +
                          new Date(entry.ended_at).toLocaleTimeString('en-AU', {
                            timeZone: 'Australia/Perth',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : ' – open'}
                      {' · Break '}
                      {formatDurationMinutes(entry.break_minutes)}
                      {' · '}
                      {entry.status}
                      {' · '}
                      {entry.entry_source}
                    </p>
                    {entry.original_worked_minutes != null &&
                    entry.original_worked_minutes !== entry.worked_minutes ? (
                      <p>Original worked: {formatDurationMinutes(entry.original_worked_minutes)}</p>
                    ) : null}
                    {entry.billable_minutes != null ? (
                      <p>Billable: {formatDurationMinutes(entry.billable_minutes)}</p>
                    ) : (
                      <p>Billable: not set</p>
                    )}
                    {entry.note ? <p>{entry.note}</p> : null}
                  </div>
                  {canReview ? (
                    <details>
                      <summary>Review</summary>
                      <form action={reviewTimeEntryAction} className="ee-edit-form">
                        <input type="hidden" name="entry_id" value={entry.id} />
                        <label>
                          Billable minutes
                          <input
                            name="billable_minutes"
                            type="number"
                            min={0}
                            defaultValue={entry.billable_minutes ?? entry.worked_minutes ?? 0}
                          />
                        </label>
                        <label>
                          Corrected start (Perth)
                          <input
                            type="datetime-local"
                            name="started_at"
                            defaultValue={perthInputValue(entry.started_at)}
                          />
                        </label>
                        <label>
                          Corrected end (Perth)
                          <input
                            type="datetime-local"
                            name="ended_at"
                            defaultValue={perthInputValue(entry.ended_at)}
                          />
                        </label>
                        <label>
                          Break minutes
                          <input type="number" name="break_minutes" min={0} defaultValue={entry.break_minutes} />
                        </label>
                        <label>
                          Rejection / correction note
                          <textarea name="rejection_reason" rows={2} maxLength={2000} />
                          <textarea name="correction_note" rows={2} maxLength={2000} placeholder="Required for corrections" />
                        </label>
                        <div className="ee-timesheet-actions">
                          <button name="decision" value="approve" type="submit">
                            Approve
                          </button>
                          <button name="decision" value="reject" type="submit">
                            Reject
                          </button>
                          <button name="decision" value="correct" type="submit">
                            Save correction
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}
                </article>
              );
            })
          )}
        </section>
      </div>
      <style>{`
.ee-timesheet-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;align-items:end}
.ee-timesheet-filters label{display:grid;gap:6px;font-size:13px;font-weight:700}
.ee-timesheet-filters input,.ee-timesheet-filters select{min-height:42px;padding:10px;border:1px solid #cbd8e6;border-radius:10px;font:inherit;font-size:16px}
.ee-timesheet-row{display:grid;gap:10px;padding:14px 0;border-bottom:1px solid #e1e8f0}
.ee-timesheet-row p{margin:4px 0 0;color:#667e91;font-size:13px}
.ee-timesheet-row a{color:#0875c9;text-decoration:none;font-weight:700}
.ee-timesheet-actions{display:flex;flex-wrap:wrap;gap:8px}
.ee-timesheet-actions button{border:1px solid #d4e1ed;border-radius:8px;background:#fff;padding:10px 12px;cursor:pointer;font-weight:700}
.ee-timesheet-actions button[value=approve]{background:#1688e9;border-color:#1688e9;color:#fff}
`}</style>
    </main>
  );
}

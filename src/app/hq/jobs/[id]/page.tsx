import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dbAdmin, requireOfficeUser } from '@/lib/hq-auth';
import { parseJobDetailTab } from '@/lib/job-detail-tabs';
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/lib/job-statuses';
import { listJobAttachments, listJobNotes, signAttachmentUrls } from '@/lib/tech-field';
import { listTimeEntriesForJob } from '@/lib/tech-time';
import { listTechWorkReportsForJob } from '@/lib/tech-work-reports';
import {
  updateJob,
  updateJobDetails,
  assignJobStaff,
  removeJobStaff,
} from '../actions';
import ScheduleAppointmentForm from './schedule-appointment-form';
import JobFieldActivity from './job-field-activity';
import JobDetailTabs, { JobTabButton } from './job-detail-tabs';
import '../../hq.css';

export const dynamic = 'force-dynamic';

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'Job created',
  status_changed: 'Status updated',
  note_added: 'Note added',
  details_updated: 'Job details updated',
  staff_assigned: 'Electrician assigned',
  staff_unassigned: 'Electrician removed',
  appointment_added: 'Appointment scheduled',
  time_started: 'Timer started',
  time_paused: 'Break started',
  time_resumed: 'Work resumed',
  time_submitted: 'Time submitted',
  time_manual_added: 'Manual time added',
  visit_progress_updated: 'Visit progress updated',
  technician_work_report_saved: 'Technician work report saved',
  technician_note_added: 'Technician note',
  technician_note_edited: 'Technician note edited',
  photo_uploaded: 'Photo uploaded',
  office_note_added: 'Office note',
  time_approved: 'Time approved',
  time_rejected: 'Time rejected',
  time_corrected: 'Time corrected',
};

type LinkedQuote = {
  id: string;
  quote_number: string;
  title: string | null;
  status: string;
  updated_at: string;
};

function formatPerth(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function jobStatusLabel(status: string): string {
  return JOB_STATUS_LABELS[status as keyof typeof JOB_STATUS_LABELS] ?? status;
}

function priorityLabel(priority: string): string {
  if (!priority) return 'Normal';
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requireOfficeUser();
  const { id } = await params;
  const { tab } = await searchParams;
  const initialTab = parseJobDetailTab(Array.isArray(tab) ? tab[0] : tab);
  const db = dbAdmin();

  const { data: job } = await db.from('jobs').select('*').eq('id', id).maybeSingle();
  if (!job) notFound();

  const appointmentSelectWithField =
    'id,starts_at,ends_at,notes,status,field_status,field_follow_up_required,field_completion_note,field_outstanding_work,field_issues';
  const appointmentSelectBase = 'id,starts_at,ends_at,notes,status';

  const [
    { data: customer },
    { data: activity },
    { data: staff },
    { data: assignments },
    appointmentsResult,
    { data: customers },
    quoteResult,
  ] = await Promise.all([
    job.customer_id
      ? db.from('customers').select('name,email,phone').eq('id', job.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('job_activity')
      .select('id,action,note,created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
      .limit(80),
    db.from('scheduling_staff').select('id,full_name').eq('active', true).order('full_name'),
    db.from('job_assignments').select('staff_id').eq('job_id', id),
    db
      .from('job_appointments')
      .select(appointmentSelectWithField)
      .eq('job_id', id)
      .order('starts_at', { ascending: true }),
    db.from('customers').select('id,name').order('name').limit(1000),
    job.quote_id
      ? db
          .from('quotes')
          .select('id,quote_number,title,status,updated_at')
          .eq('id', job.quote_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const appointments = appointmentsResult.error
    ? (
        await db
          .from('job_appointments')
          .select(appointmentSelectBase)
          .eq('job_id', id)
          .order('starts_at', { ascending: true })
      ).data
    : appointmentsResult.data;

  const appointmentIds = (appointments ?? []).map((a) => a.id as string);
  const { data: appointmentStaffRows } = appointmentIds.length
    ? await db
        .from('job_appointment_staff')
        .select('appointment_id,staff_id')
        .in('appointment_id', appointmentIds)
    : { data: [] as { appointment_id: string; staff_id: string }[] };

  let timeEntries: Awaited<ReturnType<typeof listTimeEntriesForJob>> = [];
  let notes: Awaited<ReturnType<typeof listJobNotes>> = [];
  let photos: Awaited<ReturnType<typeof signAttachmentUrls>> = [];
  try {
    const [times, noteRows, attachmentRows] = await Promise.all([
      listTimeEntriesForJob(id),
      listJobNotes({ jobId: id, includeOfficeOnly: true }),
      listJobAttachments({ jobId: id }),
    ]);
    timeEntries = times;
    notes = noteRows;
    photos = await signAttachmentUrls(attachmentRows, 600);
  } catch {
    // Milestone 2 tables may not be applied on hosted yet.
  }

  const techReports = await listTechWorkReportsForJob(id);
  const canEdit = true;
  const staffNameById = new Map((staff ?? []).map((s) => [s.id as string, s.full_name as string]));
  const assignedNames = (assignments ?? []).map((a) => ({
    id: a.staff_id as string,
    name: staffNameById.get(a.staff_id as string) ?? 'Team member',
  }));

  const visitCrewByAppointment = new Map<string, string[]>();
  for (const row of appointmentStaffRows ?? []) {
    const list = visitCrewByAppointment.get(row.appointment_id) ?? [];
    list.push(staffNameById.get(row.staff_id) ?? 'Team member');
    visitCrewByAppointment.set(row.appointment_id, list);
  }

  const upcoming = (appointments ?? []).find(
    (a) => a.status === 'scheduled' && new Date(a.ends_at).getTime() >= Date.now(),
  );
  const upcomingCrew = upcoming ? visitCrewByAppointment.get(upcoming.id as string) ?? [] : [];

  const appointmentViews = (appointments ?? []).map((a) => ({
    id: a.id as string,
    startsAt: a.starts_at as string,
    endsAt: a.ends_at as string,
    status: a.status as string,
    fieldStatus: (a as { field_status?: string }).field_status ?? 'scheduled',
    followUp: Boolean((a as { field_follow_up_required?: boolean }).field_follow_up_required),
    completionNote: (a as { field_completion_note?: string | null }).field_completion_note ?? null,
    outstanding: (a as { field_outstanding_work?: string | null }).field_outstanding_work ?? null,
    issues: (a as { field_issues?: string | null }).field_issues ?? null,
    electricianNames: visitCrewByAppointment.get(a.id as string) ?? [],
    scheduleNotes: (a.notes as string | null) ?? null,
  }));

  const field = {
    jobId: id,
    appointments: appointmentViews,
    techReports: techReports.map((report) => ({
      id: report.id,
      appointmentId: report.appointmentId,
      technicianName: report.technicianName,
      workSummary: report.workSummary,
      outstandingWork: report.outstandingWork,
      issues: report.issues,
      followUpRequired: report.followUpRequired,
      progressStatus: report.progressStatus,
      updatedAt: report.updatedAt,
    })),
    timeEntries: timeEntries.map((entry) => ({
      id: entry.id,
      staffName: staffNameById.get(entry.staffId) ?? 'Technician',
      technicianUserId: entry.technicianUserId,
      appointmentId: entry.appointmentId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      breakMinutes: entry.breakMinutes,
      workedMinutes: entry.workedMinutes,
      billableMinutes: entry.billableMinutes,
      status: entry.status,
      note: entry.note,
    })),
    notes: notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.authorName,
      visibility: note.visibility,
      createdAt: note.createdAt,
    })),
    photos: photos.map((photo) => ({
      id: photo.id,
      signedUrl: photo.signedUrl ?? null,
      caption: photo.caption,
      uploadedByName: photo.uploadedByName,
      contentType: photo.contentType,
      createdAt: photo.createdAt,
      jobNoteId: photo.jobNoteId ?? null,
    })),
  };

  const linkedQuote = (quoteResult.data ?? null) as LinkedQuote | null;
  const quoteUnavailable = Boolean(job.quote_id) && (Boolean(quoteResult.error) || !linkedQuote);

  return (
    <main className="hq-detail">
      <div className="hq-detail-inner ee-workspace">
        <Link className="hq-back" href="/hq/jobs">
          ← All jobs
        </Link>

        <header className="ee-workspace-head">
          <div>
            <div className="hq-kicker">JOB JB{String(job.job_number).padStart(5, '0')}</div>
            <h1>{job.title}</h1>
            <p>{customer?.name ?? 'No customer selected'}</p>
          </div>
          <span className="ee-workspace-status">{jobStatusLabel(job.status)}</span>
        </header>

        <JobDetailTabs
          initialTab={initialTab}
          panels={{
            overview: (
              <>
                <section className="hq-panel ee-summary">
                  <div className="ee-summary-top">
                    <div>
                      <span className="ee-eyebrow">OVERVIEW</span>
                      <h2>Job details</h2>
                    </div>
                    {canEdit ? (
                      <JobTabButton tab="more" className="ee-text-action">
                        Edit details
                      </JobTabButton>
                    ) : null}
                  </div>
                  {job.description ? <p className="ee-description">{job.description}</p> : null}
                  <div className="ee-summary-grid">
                    <div>
                      <span className="ee-eyebrow">CUSTOMER</span>
                      <strong>{customer?.name ?? 'Not assigned'}</strong>
                      {customer?.phone ? <a href={'tel:' + customer.phone}>{customer.phone}</a> : null}
                      {customer?.email ? (
                        <a href={'mailto:' + customer.email}>{customer.email}</a>
                      ) : null}
                    </div>
                    <div>
                      <span className="ee-eyebrow">LOCATION</span>
                      <strong>{job.site_address_text || 'Address needed'}</strong>
                      {job.site_address_text ? (
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={
                            'https://www.google.com/maps/search/?api=1&query=' +
                            encodeURIComponent(job.site_address_text)
                          }
                        >
                          Open directions ↗
                        </a>
                      ) : null}
                    </div>
                    <div>
                      <span className="ee-eyebrow">NEXT APPOINTMENT</span>
                      <strong>
                        {upcoming ? formatPerth(upcoming.starts_at as string) : 'Not scheduled'}
                      </strong>
                      {upcomingCrew.length ? (
                        <span className="ee-muted">Visit team: {upcomingCrew.join(', ')}</span>
                      ) : null}
                      <JobTabButton tab="visits">Manage appointments</JobTabButton>
                    </div>
                    <div>
                      <span className="ee-eyebrow">JOB TEAM</span>
                      <strong>
                        {assignedNames.length
                          ? assignedNames.map((person) => person.name).join(', ')
                          : 'Not assigned'}
                      </strong>
                      <span className="ee-muted">Job-level default crew</span>
                      <JobTabButton tab="more">Manage team</JobTabButton>
                    </div>
                  </div>
                </section>

                <section className="hq-panel ee-compact-panel">
                  <div className="ee-section-title">
                    <div>
                      <span className="ee-eyebrow">WORKFLOW</span>
                      <h2>Job status</h2>
                    </div>
                  </div>
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    {jobStatusLabel(job.status)} · Priority {priorityLabel(job.priority)}
                  </p>
                  {canEdit ? (
                    <details className="ee-expand">
                      <summary>
                        Change status{' '}
                        <span className="ee-expand-mark" aria-hidden="true">
                          ＋
                        </span>
                      </summary>
                      <form action={updateJob} className="ee-edit-form">
                        <input type="hidden" name="id" value={id} />
                        <label>
                          Status
                          <select name="status" defaultValue={job.status}>
                            {JOB_STATUSES.map((status) => (
                              <option value={status} key={status}>
                                {JOB_STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Note (optional)
                          <textarea
                            name="note"
                            rows={2}
                            maxLength={2000}
                            placeholder="Add context for your team"
                          />
                        </label>
                        <button className="hq-detail-action-primary">Save status</button>
                      </form>
                    </details>
                  ) : null}
                </section>

                <JobFieldActivity {...field} section="attention" />
              </>
            ),
            visits: (
              <JobFieldActivity
                {...field}
                section="visits"
                scheduleForm={canEdit ? <ScheduleAppointmentForm jobId={id} /> : null}
              />
            ),
            time: <JobFieldActivity {...field} section="time" />,
            costs: <JobFieldActivity {...field} section="costs" />,
            quotes: (
              <section className="hq-panel ee-compact-panel">
                <div className="ee-section-title">
                  <div>
                    <span className="ee-eyebrow">QUOTES</span>
                    <h2>Linked quote</h2>
                  </div>
                </div>
                {linkedQuote ? (
                  <div className="ee-visit">
                    <strong>
                      {linkedQuote.quote_number}
                      {linkedQuote.title ? ` · ${linkedQuote.title}` : ''}
                    </strong>
                    <span>
                      {linkedQuote.status.replaceAll('_', ' ')} · Updated{' '}
                      {formatPerth(linkedQuote.updated_at)}
                    </span>
                    <span className="ee-quote-links">
                      <Link href={'/hq/quotes/' + linkedQuote.id}>Open quote</Link>
                      <Link href={'/hq/quotes/' + linkedQuote.id + '/preview'}>Preview</Link>
                    </span>
                  </div>
                ) : quoteUnavailable ? (
                  <p className="ee-muted" style={{ marginBottom: 0 }}>
                    This job points at a quote that could not be loaded. Linking and unlinking are
                    not available on this screen yet.
                  </p>
                ) : (
                  <p className="ee-muted" style={{ marginBottom: 0 }}>
                    No quote is linked to this job yet. Linking a quote will be added in a later
                    update.
                  </p>
                )}
              </section>
            ),
            invoices: (
              <section className="hq-panel ee-compact-panel">
                <div className="ee-section-title">
                  <div>
                    <span className="ee-eyebrow">INVOICES</span>
                    <h2>Invoices</h2>
                  </div>
                </div>
                <p className="ee-muted" style={{ marginBottom: 0 }}>
                  Invoices will appear here in a later update. Xero stays the accounting record.
                  This screen does not create or change invoices.
                </p>
              </section>
            ),
            more: (
              <>
                <JobFieldActivity {...field} section="files" />

                <section id="team" className="hq-panel ee-compact-panel">
                  <div className="ee-section-title">
                    <div>
                      <span className="ee-eyebrow">TEAM</span>
                      <h2>Job electricians</h2>
                    </div>
                  </div>
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Default crew for this job. Each visit can have its own assigned electricians
                    under Visits.
                  </p>
                  {assignedNames.length ? (
                    <div className="ee-team-list">
                      {assignedNames.map((person) => (
                        <div key={person.id}>
                          <span className="ee-avatar">{person.name.charAt(0)}</span>
                          <strong>{person.name}</strong>
                          {canEdit ? (
                            <form action={removeJobStaff}>
                              <input type="hidden" name="job_id" value={id} />
                              <input type="hidden" name="staff_id" value={person.id} />
                              <button type="submit" aria-label={'Remove ' + person.name}>
                                Remove
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ee-muted">No electricians assigned.</p>
                  )}
                  {canEdit && (staff ?? []).some((person) => !assignedNames.some((a) => a.id === person.id)) ? (
                    <details className="ee-expand">
                      <summary>
                        + Assign electrician
                        <span className="ee-expand-mark" aria-hidden="true">
                          ＋
                        </span>
                      </summary>
                      <form action={assignJobStaff} className="ee-job-inline">
                        <input type="hidden" name="job_id" value={id} />
                        <select name="staff_id" required defaultValue="">
                          <option value="" disabled>
                            Choose staff member
                          </option>
                          {(staff ?? [])
                            .filter((person) => !assignedNames.some((a) => a.id === person.id))
                            .map((person) => (
                              <option key={person.id} value={person.id}>
                                {person.full_name}
                              </option>
                            ))}
                        </select>
                        <button type="submit">Assign</button>
                      </form>
                    </details>
                  ) : null}
                  {canEdit && !(staff ?? []).length ? (
                    <p className="ee-muted">No active scheduling staff available to assign.</p>
                  ) : null}
                </section>

                {canEdit ? (
                  <section id="edit-job" className="hq-panel ee-compact-panel">
                    <details className="ee-expand ee-edit-details" open>
                      <summary>
                        Edit job information{' '}
                        <span className="ee-expand-mark" aria-hidden="true">
                          ＋
                        </span>
                      </summary>
                      <form action={updateJobDetails} className="ee-edit-form">
                        <input type="hidden" name="id" value={id} />
                        <label>
                          Job title
                          <input
                            name="title"
                            defaultValue={job.title}
                            minLength={2}
                            maxLength={200}
                            required
                          />
                        </label>
                        <label>
                          Customer
                          <select name="customer_id" defaultValue={job.customer_id ?? ''}>
                            <option value="">Not selected</option>
                            {(customers ?? []).map((item) => (
                              <option value={item.id} key={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Site address
                          <input
                            name="site_address_text"
                            defaultValue={job.site_address_text ?? ''}
                            maxLength={500}
                            placeholder="Street, suburb, postcode"
                          />
                        </label>
                        <label>
                          Priority
                          <select name="priority" defaultValue={job.priority}>
                            {['low', 'normal', 'high', 'urgent'].map((priority) => (
                              <option key={priority} value={priority}>
                                {priorityLabel(priority)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Work description
                          <textarea
                            name="description"
                            defaultValue={job.description ?? ''}
                            maxLength={5000}
                            rows={3}
                          />
                        </label>
                        <button className="hq-detail-action-primary">Save job details</button>
                      </form>
                    </details>
                  </section>
                ) : null}

                <section className="hq-panel ee-compact-panel" id="activity-history">
                  <details className="ee-expand ee-edit-details">
                    <summary>
                      <span>
                        Activity history
                        <span className="ee-muted" style={{ marginLeft: 8, fontWeight: 500 }}>
                          {activity?.length ?? 0} events
                        </span>
                      </span>
                      <span className="ee-expand-mark" aria-hidden="true">
                        ＋
                      </span>
                    </summary>
                    <div style={{ paddingTop: 8 }}>
                      {activity?.length ? (
                        activity.map((item) => (
                          <div className="ee-event" key={item.id}>
                            <span className="ee-event-dot" />
                            <div>
                              <strong>
                                {ACTIVITY_LABELS[item.action] ?? item.action.replaceAll('_', ' ')}
                              </strong>
                              {item.note ? <p>{item.note}</p> : null}
                              <small>{formatPerth(item.created_at)}</small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="ee-muted">No activity yet.</p>
                      )}
                    </div>
                  </details>
                </section>
              </>
            ),
          }}
        />
      </div>

      <style>{`
.ee-workspace{max-width:1000px}
.ee-workspace-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin:20px 0 8px;scroll-margin-top:calc(var(--ee-job-sticky-offset,var(--hq-shell-header-height,76px)) + 8px)}
.ee-workspace-head h1{margin:8px 0;font-size:clamp(28px,5vw,40px);line-height:1.15}
.ee-workspace-head p,.ee-muted{color:var(--hq-muted,#738396)}
.ee-workspace-status{display:inline-flex;align-items:center;background:#eaf2fa;color:#18577d;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:700;white-space:nowrap}
.ee-workspace{--ee-job-sticky-offset:var(--hq-shell-header-height,76px);--ee-job-tab-height:52px}
.ee-job-tabs{display:flex;gap:2px;margin:8px 0 16px;overflow-x:auto;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-bottom:1px solid #d5e2ef;position:sticky;top:var(--ee-job-sticky-offset);z-index:5;background:#f5f8fb;width:100%;max-width:100%;box-sizing:border-box}
.ee-job-tabs::-webkit-scrollbar{display:none}
.ee-job-tabs button{flex:0 0 auto;border:0;border-bottom:3px solid transparent;background:transparent;color:#4d677a;font:inherit;font-size:14px;font-weight:750;padding:12px 14px 10px;min-height:44px;cursor:pointer;white-space:nowrap}
.ee-job-tabs button[aria-selected="true"]{color:#0875c9;border-bottom-color:#1688e9}
.ee-job-tabs button:focus-visible{outline:2px solid #1688e9;outline-offset:-2px;border-radius:8px}
.ee-job-panel{scroll-margin-top:calc(var(--ee-job-sticky-offset) + var(--ee-job-tab-height) + 8px)}
.ee-expand,.ee-job-row{scroll-margin-top:calc(var(--ee-job-sticky-offset) + var(--ee-job-tab-height) + 8px)}
@media(min-width:1000px){
  .ee-workspace{--ee-job-sticky-offset:0px}
  .ee-job-tabs{top:0;background:#f5f8fb;box-shadow:0 1px 0 #d5e2ef}
}
.ee-summary,.ee-compact-panel{padding:22px;margin-bottom:12px;overflow:hidden}
.ee-summary-top,.ee-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ee-summary h2,.ee-section-title h2{margin:5px 0 10px;font-size:22px}
.ee-summary-top{margin-bottom:12px}
.ee-eyebrow{color:#1688e9;font-size:11px;font-weight:800;letter-spacing:.12em}
.ee-text-action,.ee-summary-grid a,.ee-quote-links a{color:#0875c9;font-size:13px;text-decoration:none}
button.ee-text-action{border:0;background:transparent;padding:0;font:inherit;font-size:13px;font-weight:700;cursor:pointer;text-align:left}
.ee-quote-links{display:flex;flex-wrap:wrap;gap:14px}
.ee-description{margin:6px 0 18px;line-height:1.5}
.ee-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;border-top:1px solid #e1e8f0;padding-top:20px}
.ee-summary-grid>div{display:grid;align-content:start;gap:6px;min-width:0}
.ee-summary-grid strong{overflow-wrap:anywhere;font-size:15px}
.ee-job-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.ee-job-stat-grid>div{display:grid;gap:4px;min-width:0;padding:12px 14px;border:1px solid #e1e8f0;border-radius:12px;background:#f8fbfe}
.ee-job-stat-grid strong{font-size:16px;color:#10233a}
.ee-attention{border:1px solid #f0d9a8;background:#fffaf0}
.ee-attention-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.ee-attention-list li{display:grid;gap:2px}
.ee-job-row{border-top:1px solid #e1e8f0;margin-top:10px;padding-top:10px}
.ee-job-row>summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:4px 0;min-height:36px;color:inherit}
.ee-job-row>summary::-webkit-details-marker{display:none}
.ee-job-row-main{display:grid;gap:2px;min-width:0;text-align:left}
.ee-job-row-main strong{color:#10233a;font-size:15px;font-weight:700;overflow-wrap:anywhere}
.ee-job-row-body{padding:10px 0 4px;display:grid;gap:10px;min-width:0}
.ee-job-subblock{display:grid;gap:6px;min-width:0}
.ee-job-subblock p{margin:0;overflow-wrap:anywhere}
.ee-report-summaries{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.ee-nested-expand{border-top:1px solid #eef3f8;margin-top:0;padding-top:6px}
.ee-nested-expand>summary{color:inherit}
.ee-nested-expand>summary strong{color:#10233a}
.ee-pending-block{background:#fff7eb;border:1px solid #f0d9a8;border-radius:12px;padding:12px 14px;margin:14px 0 8px}
.ee-job-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-top:8px}
.ee-job-table{width:100%;border-collapse:collapse;font-size:13px}
.ee-job-table th,.ee-job-table td{text-align:left;padding:8px 10px;border-bottom:1px solid #ead9b8;vertical-align:top}
.ee-job-table th{font-size:11px;letter-spacing:.04em;color:#8a5a12;font-weight:800}
.ee-job-table tbody th{font-size:13px;letter-spacing:0;color:#10233a;font-weight:700}
.ee-time-filters{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 10px}
.ee-time-filters button{border:1px solid #d5e2ef;background:#fff;color:#4d677a;border-radius:10px;padding:9px 12px;min-height:40px;font:inherit;font-size:13px;font-weight:750;cursor:pointer}
.ee-time-filters button.active{background:#e7f3ff;border-color:#9bcbf4;color:#076ab5}
.ee-time-table-wrap{display:none}
.ee-time-entry-list{display:grid;gap:10px;margin-top:8px}
.ee-time-entry-card{border:1px solid #e1e8f0;border-radius:12px;padding:12px 14px;background:#fff;display:grid;gap:8px}
.ee-time-entry-pending{border-color:#f0d9a8;background:#fffaf0}
.ee-time-entry-main{display:grid;gap:4px;min-width:0}
.ee-time-entry-main p{margin:0;overflow-wrap:anywhere}
.ee-time-review{border-top:1px solid #ead9b8;margin-top:2px;padding-top:8px}
.ee-time-desktop-reviews{display:none}
.ee-update-feed{display:grid;gap:12px;margin-top:12px}
.ee-update-card{border:1px solid #e1e8f0;border-radius:12px;padding:14px;background:#fff;display:grid;gap:10px}
.ee-update-card header{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}
.ee-update-card header small{color:var(--hq-muted,#738396)}
.ee-update-card p{margin:0;overflow-wrap:anywhere;line-height:1.45}
@media(min-width:900px){
  .ee-time-table-wrap{display:block}
  .ee-time-entry-list{display:none}
  .ee-time-desktop-reviews{display:grid;gap:8px;margin-top:12px}
  .ee-time-table tbody tr.ee-time-pending-row{background:#fff7eb}
}
.ee-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.ee-photo-grid figure{margin:0}
.ee-photo-grid a{display:block;aspect-ratio:1;border-radius:10px;overflow:hidden;border:1px solid #e1eaf1}
.ee-photo-grid img{width:100%;height:100%;object-fit:cover}
.ee-photo-grid figcaption{font-size:11px;margin-top:4px;line-height:1.3}
.ee-expand{border-top:1px solid #e1e8f0;margin-top:14px;padding-top:13px}
.ee-expand summary{cursor:pointer;color:#0875c9;font-weight:700;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 0}
.ee-expand summary::-webkit-details-marker{display:none}
.ee-expand.ee-job-row>summary,
.ee-expand.ee-nested-expand>summary{color:inherit;font-weight:600;align-items:flex-start}
.ee-expand-mark{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;font-size:20px;line-height:1;color:#0875c9;transform:none;transform-origin:center;transition:transform .15s ease}
.ee-expand[open]>summary>.ee-expand-mark{transform:rotate(45deg)}
.ee-edit-form{display:grid;gap:14px;padding-top:16px;max-width:650px}
.ee-edit-form label{display:grid;gap:7px;font-weight:600}
.ee-edit-form input,.ee-edit-form select,.ee-edit-form textarea,.ee-job-inline select{box-sizing:border-box;width:100%;min-width:0;padding:12px;border:1px solid #cbd8e6;border-radius:10px;background:var(--hq-card,#fff);color:inherit;font:inherit;font-size:16px}
.ee-edit-form button{justify-self:start}
.ee-review-actions{display:flex;flex-wrap:wrap;gap:8px}
.ee-review-actions button{border:1px solid #d4e1ed;border-radius:10px;background:#fff;color:#17669e;padding:10px 12px;min-height:44px;font:inherit;font-weight:800;cursor:pointer}
.ee-review-actions button[value=approve]{background:#1688e9;border-color:#1688e9;color:#fff}
.ee-team-list{display:grid;gap:10px}
.ee-team-list>div{display:flex;align-items:center;gap:12px}
.ee-team-list form{margin-left:auto}
.ee-team-list button{border:0;background:transparent;color:#0875c9;padding:8px}
.ee-avatar{display:grid;place-items:center;background:#e6f1fd;color:#1165a7;border-radius:50%;width:35px;height:35px;font-weight:800}
.ee-job-inline{display:flex;gap:8px;margin-top:14px}
.ee-job-inline button{border:0;border-radius:10px;background:#1688e9;color:white;padding:10px 16px}
.ee-visit{display:grid;gap:5px;border-bottom:1px solid #e1e8f0;padding:12px 0}
.ee-visit span,.ee-visit p{color:var(--hq-muted,#738396);margin:0}
.ee-edit-details{border:0;margin:0;padding:0}
.ee-event{display:flex;gap:13px;padding:13px 0;border-bottom:1px solid #e1e8f0}
.ee-event-dot{width:10px;height:10px;background:#1688e9;border-radius:50%;margin-top:5px;flex-shrink:0}
.ee-event p{margin:5px 0;overflow-wrap:anywhere}
.ee-event small{display:block;color:var(--hq-muted,#738396);margin-top:5px}
@media(max-width:600px){
  .ee-workspace-head{align-items:flex-start}
  .ee-summary,.ee-compact-panel{padding:18px}
  .ee-summary-grid{gap:18px 12px}
  .ee-summary-grid strong{font-size:14px}
  .ee-workspace-status{font-size:12px;padding:6px 9px}
  .ee-summary h2,.ee-section-title h2{font-size:20px}
  .ee-job-stat-grid{grid-template-columns:minmax(0,1fr)}
}
.ee-workspace .ee-summary-grid{gap:14px;padding-top:16px}
.ee-workspace .ee-description{margin:4px 0 16px}
.ee-workspace .ee-summary,.ee-workspace .ee-compact-panel{padding:20px}
.ee-workspace .ee-expand summary{min-height:44px}
.ee-workspace .ee-edit-form{gap:10px}
.ee-workspace .ee-edit-form label{gap:5px}
.ee-workspace .ee-edit-form input[type="datetime-local"]{min-height:48px;color-scheme:light}
.ee-workspace .ee-edit-form textarea{resize:vertical}
.ee-workspace .ee-job-inline{flex-wrap:wrap}
.ee-workspace .ee-job-inline select{flex:1 1 170px}
.ee-workspace .ee-job-inline button{min-height:44px}
.ee-workspace .ee-summary-grid a,.ee-workspace .ee-summary-grid button{overflow-wrap:anywhere}
.ee-workspace .ee-visit{line-height:1.4}
@media(min-width:1100px){
  .ee-workspace{max-width:1180px}
  .ee-workspace .ee-summary-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
}
@media(max-width:760px){
  .ee-workspace .ee-section-title{flex-wrap:wrap;align-items:flex-start}
  .ee-workspace .ee-section-title>.ee-muted{width:100%}
  .ee-workspace .ee-summary,.ee-workspace .ee-compact-panel{padding:17px}
  .ee-workspace .ee-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 10px}
  .ee-workspace .ee-workspace-head{gap:8px}
  .ee-workspace .ee-summary-grid strong{font-size:14px}
  .ee-job-stat-grid{grid-template-columns:minmax(0,1fr)}
  .ee-job-tabs{margin-right:-4px}
}
@media(min-width:761px) and (max-width:1099px){
  .ee-job-stat-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media(prefers-reduced-motion:reduce){
  .ee-expand-mark{transition:none}
}
`}</style>
    </main>
  );
}

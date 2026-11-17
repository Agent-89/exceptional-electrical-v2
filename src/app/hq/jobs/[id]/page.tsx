import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dbAdmin, requireOfficeUser } from '@/lib/hq-auth';
import { parseJobDetailTab } from '@/lib/job-detail-tabs';
import {
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  JOB_STATUS_TONES,
  isJobStatus,
} from '@/lib/job-statuses';
import { staffColor } from '@/lib/staff-color';
import { updateJob, updateJobDetails } from '../actions';
import {
  formatJobActivityWhen,
  presentJobActivityEvent,
} from '@/lib/review-time-entry';
import ScheduleAppointmentForm from './schedule-appointment-form';
import JobFieldActivity from './job-field-activity';
import JobDetailTabs, { JobTabButton } from './job-detail-tabs';
import JobHeaderActions from './job-header-actions';
import JobQuotesPanel from './job-quotes-panel';
import { loadJobQuotesForDisplay } from '@/lib/job-quotes-store';
import {
  SuspendedJobAttention,
  SuspendedJobFiles,
  SuspendedJobTime,
} from './job-field-sections';
import { getCachedActiveSchedulingStaff } from '@/lib/hq-reference-cache';
import '../../hq.css';

const JOB_DETAIL_COLUMNS =
  'id,job_number,title,status,priority,description,customer_id,site_address_text,quote_id,enquiry_id,scheduled_start,next_action_at,source,updated_at,created_at';

export const dynamic = 'force-dynamic';

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

function staffInitials(name: string, initials?: string | null): string {
  const raw = (initials || '').trim();
  if (raw) return raw.slice(0, 2).toUpperCase();
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string | string[];
    notice?: string | string[];
    error?: string | string[];
  }>;
}) {
  await requireOfficeUser();
  const { id } = await params;
  const query = await searchParams;
  const initialTab = parseJobDetailTab(Array.isArray(query.tab) ? query.tab[0] : query.tab);
  const notice = Array.isArray(query.notice) ? query.notice[0] : query.notice;
  const actionError = Array.isArray(query.error) ? query.error[0] : query.error;
  const db = dbAdmin();

  const { data: job } = await db.from('jobs').select(JOB_DETAIL_COLUMNS).eq('id', id).maybeSingle();
  if (!job) notFound();

  const appointmentSelectWithResolution =
    'id,starts_at,ends_at,notes,status,field_status,field_follow_up_required,field_follow_up_resolved_at,field_follow_up_resolution,field_follow_up_linked_appointment_id,field_follow_up_resolution_note,field_completion_note,field_outstanding_work,field_issues';
  const appointmentSelectWithField =
    'id,starts_at,ends_at,notes,status,field_status,field_follow_up_required,field_completion_note,field_outstanding_work,field_issues';
  const appointmentSelectBase = 'id,starts_at,ends_at,notes,status';

  const [
    { data: customer },
    { data: activity },
    staff,
    appointmentsResult,
    { data: customerSeed },
    jobQuotesResult,
    { data: linkedEnquiry },
  ] = await Promise.all([
    job.customer_id
      ? db.from('customers').select('id,name,email,phone').eq('id', job.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('job_activity')
      .select('id,action,note,created_at')
      .eq('job_id', id)
      .order('created_at', { ascending: false })
      .limit(80),
    getCachedActiveSchedulingStaff(),
    db
      .from('job_appointments')
      .select(appointmentSelectWithResolution)
      .eq('job_id', id)
      .order('starts_at', { ascending: true }),
    db.from('customers').select('id,name').order('name').limit(80),
    loadJobQuotesForDisplay(db, id, job.quote_id as string | null),
    job.enquiry_id
      ? db.from('enquiries').select('id,reference_number').eq('id', job.enquiry_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Soft-fallback across schema vintages (base → field ops → follow-up resolution columns).
  let appointments: Array<Record<string, unknown>> | null =
    (appointmentsResult.data as Array<Record<string, unknown>> | null) ?? null;
  if (appointmentsResult.error) {
    const fieldOnly = await db
      .from('job_appointments')
      .select(appointmentSelectWithField)
      .eq('job_id', id)
      .order('starts_at', { ascending: true });
    if (fieldOnly.error) {
      appointments =
        ((
          await db
            .from('job_appointments')
            .select(appointmentSelectBase)
            .eq('job_id', id)
            .order('starts_at', { ascending: true })
        ).data as Array<Record<string, unknown>> | null) ?? null;
    } else {
      appointments = (fieldOnly.data as Array<Record<string, unknown>> | null) ?? null;
    }
  }

  const appointmentIds = (appointments ?? []).map((a) => String(a.id));
  const { data: appointmentStaffRows } = appointmentIds.length
    ? await db
        .from('job_appointment_staff')
        .select('appointment_id,staff_id')
        .in('appointment_id', appointmentIds)
    : { data: [] as { appointment_id: string; staff_id: string }[] };

  const canEdit = true;
  const staffById = new Map(staff.map((s) => [s.id, s]));
  const staffNameById = new Map(staff.map((s) => [s.id, s.full_name]));
  const staffNames = Object.fromEntries(staffNameById.entries());

  const activeAppointmentIds = new Set(
    (appointments ?? [])
      .filter((a) => String(a.status) !== 'cancelled')
      .map((a) => String(a.id)),
  );
  const jobTeamIds: string[] = [];
  const jobTeamSeen = new Set<string>();
  for (const row of appointmentStaffRows ?? []) {
    if (!activeAppointmentIds.has(row.appointment_id) || jobTeamSeen.has(row.staff_id)) continue;
    jobTeamSeen.add(row.staff_id);
    jobTeamIds.push(row.staff_id);
  }
  const jobTeam = jobTeamIds.map((staffId) => {
    const member = staffById.get(staffId);
    const name = member?.full_name ?? 'Team member';
    return {
      id: staffId,
      name,
      initials: staffInitials(name, member?.initials),
      avatarColor: member?.avatar_color ?? null,
    };
  });

  const visitCrewByAppointment = new Map<
    string,
    { id: string; name: string; avatarColor: string | null }[]
  >();
  for (const row of appointmentStaffRows ?? []) {
    const list = visitCrewByAppointment.get(row.appointment_id) ?? [];
    const member = staffById.get(row.staff_id);
    list.push({
      id: row.staff_id,
      name: member?.full_name ?? staffNameById.get(row.staff_id) ?? 'Team member',
      avatarColor: member?.avatar_color ?? null,
    });
    visitCrewByAppointment.set(row.appointment_id, list);
  }

  const upcoming = (appointments ?? []).find(
    (a) => a.status === 'scheduled' && new Date(String(a.ends_at)).getTime() >= Date.now(),
  );
  const upcomingCrew = upcoming
    ? (visitCrewByAppointment.get(String(upcoming.id)) ?? []).map((member) => member.name)
    : [];

  const appointmentViews = (appointments ?? []).map((a) => {
    const crew = visitCrewByAppointment.get(String(a.id)) ?? [];
    return {
      id: String(a.id),
      startsAt: String(a.starts_at),
      endsAt: String(a.ends_at),
      status: String(a.status),
      fieldStatus: (a.field_status as string | undefined) ?? 'scheduled',
      followUp: Boolean(a.field_follow_up_required),
      followUpResolvedAt: (a.field_follow_up_resolved_at as string | null | undefined) ?? null,
      followUpLinkedAppointmentId:
        (a.field_follow_up_linked_appointment_id as string | null | undefined) ?? null,
      followUpResolution:
        (a.field_follow_up_resolution as 'linked_visit' | 'office_cleared' | null | undefined) ?? null,
      followUpResolutionNote:
        (a.field_follow_up_resolution_note as string | null | undefined) ?? null,
      completionNote: (a.field_completion_note as string | null | undefined) ?? null,
      outstanding: (a.field_outstanding_work as string | null | undefined) ?? null,
      issues: (a.field_issues as string | null | undefined) ?? null,
      electricianNames: crew.map((member) => member.name),
      crew,
      scheduleNotes: (a.notes as string | null | undefined) ?? null,
    };
  });

  const customersById = new Map((customerSeed ?? []).map((row) => [row.id as string, row]));
  if (customer?.id) customersById.set(customer.id as string, { id: customer.id, name: customer.name });
  const customers = [...customersById.values()];

  const linkedQuotes = jobQuotesResult.quotes;
  const primaryQuote =
    linkedQuotes.find((quote) => quote.isPrimary) ?? linkedQuotes[0] ?? null;
  const extraQuoteCount = Math.max(0, linkedQuotes.length - (primaryQuote ? 1 : 0));
  const jobNumberLabel = `JB${String(job.job_number).padStart(5, '0')}`;

  return (
    <main className="hq-detail">
      <div className="hq-detail-inner ee-workspace">
        <Link className="hq-back" href="/hq/jobs">
          ← All jobs
        </Link>

        <header className="ee-workspace-head">
          <div className="ee-workspace-head-main">
            <div className="ee-job-number">JOB {jobNumberLabel}</div>
            <h1>{customer?.name ?? 'No customer selected'}</h1>
            {(linkedEnquiry || primaryQuote) ? (
              <div className="ee-job-provenance">
                {linkedEnquiry ? (
                  <Link
                    className="ee-job-provenance-item"
                    href={`/hq/enquiries/${linkedEnquiry.id}`}
                  >
                    <span className="ee-job-provenance-label">Enquiry</span>
                    <span className="ee-job-provenance-id">
                      ENQ-{String(linkedEnquiry.reference_number).padStart(4, '0')}
                    </span>
                  </Link>
                ) : null}
                {primaryQuote ? (
                  <Link className="ee-job-provenance-item" href={`/hq/quotes/${primaryQuote.id}`}>
                    <span className="ee-job-provenance-label">Quote</span>
                    <span className="ee-job-provenance-id">{primaryQuote.quoteNumber}</span>
                  </Link>
                ) : null}
                {extraQuoteCount > 0 ? (
                  <Link className="ee-job-provenance-more" href={`/hq/jobs/${id}?tab=quotes`}>
                    +{extraQuoteCount} more
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
          {canEdit ? (
            <JobHeaderActions
              status={String(job.status)}
              statusLabel={jobStatusLabel(job.status)}
              statusTone={
                isJobStatus(String(job.status)) ? JOB_STATUS_TONES[job.status as keyof typeof JOB_STATUS_TONES] : 'neutral'
              }
              statusForm={
                <form action={updateJob} className="ee-job-status-form">
                  <input type="hidden" name="id" value={id} />
                  <label>
                    <span className="ee-eyebrow">STATUS</span>
                    <select name="status" defaultValue={job.status} aria-label="Job status">
                      {JOB_STATUSES.map((status) => (
                        <option value={status} key={status}>
                          {JOB_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="ee-eyebrow">NOTE (OPTIONAL)</span>
                    <textarea
                      name="note"
                      rows={2}
                      maxLength={2000}
                      placeholder="Add context for your team"
                    />
                  </label>
                  <button type="submit" className="hq-detail-action-primary">
                    Save status
                  </button>
                </form>
              }
            />
          ) : (
            <span
              className={`ee-workspace-status ee-workspace-status--${
                isJobStatus(String(job.status))
                  ? JOB_STATUS_TONES[job.status as keyof typeof JOB_STATUS_TONES]
                  : 'neutral'
              }`}
            >
              <span className="ee-workspace-status-dot" aria-hidden="true" />
              <span className="ee-workspace-status-label">{jobStatusLabel(job.status)}</span>
            </span>
          )}
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
                      <a href="#edit-job" className="ee-text-action">
                        Edit details
                      </a>
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
                      {jobTeam.length ? (
                        <div className="ee-job-team-avatars" aria-label="Job team">
                          {jobTeam.map((person) => (
                            <span
                              key={person.id}
                              className="ee-avatar"
                              style={{
                                backgroundColor: staffColor(person.id, person.avatarColor),
                                color: '#fff',
                              }}
                              title={person.name}
                              aria-label={person.name}
                            >
                              {person.initials}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <strong>Not assigned</strong>
                      )}
                    </div>
                  </div>
                </section>

                <SuspendedJobAttention jobId={id} appointments={appointmentViews} staffNames={staffNames} />

                {canEdit ? (
                  <section id="edit-job" className="hq-panel ee-compact-panel">
                    <details className="ee-expand ee-edit-details">
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
              </>
            ),
            notes: (
              <SuspendedJobFiles jobId={id} appointments={appointmentViews} staffNames={staffNames} />
            ),
            visits: (
              <JobFieldActivity
                jobId={id}
                appointments={appointmentViews}
                techReports={[]}
                timeEntries={[]}
                notes={[]}
                photos={[]}
                section="visits"
                scheduleForm={
                  canEdit ? (
                    <ScheduleAppointmentForm
                      jobId={id}
                      staff={staff}
                      defaultStaffIds={jobTeam.map((person) => person.id)}
                    />
                  ) : null
                }
              />
            ),
            time: <SuspendedJobTime jobId={id} appointments={appointmentViews} staffNames={staffNames} />,
            quotes: (
              <JobQuotesPanel
                jobId={id}
                customerId={(job.customer_id as string | null) ?? null}
                quotes={jobQuotesResult.quotes}
                tableAvailable={jobQuotesResult.tableAvailable}
                loadError={jobQuotesResult.error}
                notice={notice}
                actionError={actionError}
                canEdit={canEdit}
              />
            ),
            invoices: (
              <section className="hq-panel ee-compact-panel">
                <div className="ee-section-title">
                  <div>
                    <span className="ee-eyebrow">INVOICES</span>
                    <h2>Billing</h2>
                  </div>
                </div>
                <p className="ee-muted" style={{ marginTop: 0 }}>
                  Invoice listing and Xero reconciliation will land with C2 billing. Nothing to show
                  here yet.
                </p>
              </section>
            ),
            activity: (
              <section className="hq-panel ee-compact-panel" id="activity-history">
                <div className="ee-section-title">
                  <div>
                    <span className="ee-eyebrow">ACTIVITY</span>
                    <h2>Activity history</h2>
                  </div>
                  <span className="ee-muted">{activity?.length ?? 0} events</span>
                </div>
                <div style={{ paddingTop: 8 }}>
                  {activity?.length ? (
                    activity.map((item) => {
                      const presented = presentJobActivityEvent(item.action, item.note);
                      return (
                        <div className="ee-event" key={item.id}>
                          <span className="ee-event-dot" />
                          <div>
                            <strong>{presented.title}</strong>
                            {presented.summary ? <p>{presented.summary}</p> : null}
                            {presented.expandable && presented.detail ? (
                              <details className="ee-activity-detail">
                                <summary>Full details</summary>
                                <p>{presented.detail}</p>
                              </details>
                            ) : null}
                            <small>{formatJobActivityWhen(item.created_at)}</small>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="ee-muted">No activity yet.</p>
                  )}
                </div>
              </section>
            ),
            more: (
              <>
                <section className="hq-panel ee-compact-panel">
                  <div className="ee-section-title">
                    <div>
                      <span className="ee-eyebrow">PURCHASE ORDERS</span>
                      <h2>Purchase orders</h2>
                    </div>
                  </div>
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Coming later with purchasing and inventory. Costs will get its own tab when
                    materials tracking ships.
                  </p>
                </section>
                <section className="hq-panel ee-compact-panel">
                  <div className="ee-section-title">
                    <div>
                      <span className="ee-eyebrow">BILLS</span>
                      <h2>Bills</h2>
                    </div>
                  </div>
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Coming later if the office needs supplier bill tracking on the job.
                  </p>
                </section>
                <section className="hq-panel ee-compact-panel">
                  <div className="ee-section-title">
                    <div>
                      <span className="ee-eyebrow">FORMS</span>
                      <h2>Forms</h2>
                    </div>
                  </div>
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Coming later for certificates, compliance packs, and job service reports.
                  </p>
                </section>
              </>
            ),
          }}
        />
      </div>

      <style>{`
.ee-workspace{max-width:1000px}
.ee-workspace-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:20px 0 8px;scroll-margin-top:calc(var(--ee-job-sticky-offset,var(--hq-shell-header-height,76px)) + 8px)}
.ee-workspace-head-main{min-width:0;flex:1 1 auto}
.ee-job-number{color:#0875c9;font-size:13px;font-weight:850;letter-spacing:.08em}
.ee-workspace-head h1{margin:6px 0 0;font-size:clamp(28px,5vw,40px);line-height:1.15}
.ee-workspace-head p,.ee-muted{color:var(--hq-muted,#738396)}
.ee-job-provenance{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0 0}
.ee-job-provenance-item{display:inline-flex;align-items:center;gap:6px;flex:0 1 auto;width:fit-content;max-width:100%;box-sizing:border-box;padding:5px 10px;border:1px solid #d5e2ef;border-radius:999px;background:#fff;color:#18577d;text-decoration:none;white-space:nowrap}
.ee-job-provenance-label{color:var(--hq-muted,#738396);font-size:12px;font-weight:700;flex:none}
.ee-job-provenance-id{color:#0875c9;font-size:13px;font-weight:800;min-width:0}
.ee-job-provenance-more{color:#0875c9;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap}
.ee-visits-section-title{margin-bottom:0}
.ee-visits-section-title h2{margin-bottom:4px}
.ee-visits-section-stats{margin:0 0 8px}
.ee-job-header-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.ee-workspace-status{display:inline-flex;align-items:center;gap:7px;background:#eaf2fa;color:#18577d;border-radius:999px;padding:7px 10px 7px 12px;font-size:13px;font-weight:700;white-space:nowrap;border:1px solid transparent}
.ee-workspace-status-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:0 0 auto}
.ee-workspace-status-label{line-height:1}
.ee-workspace-status--neutral{background:#eef2f6;color:#4d677a}
.ee-workspace-status--info{background:#eaf2fa;color:#18577d}
.ee-workspace-status--success{background:#e8f7ef;color:#0b6b3a}
.ee-workspace-status--warning{background:#fff4e5;color:#9a3412}
.ee-workspace-status--accent{background:#f3eefc;color:#5b2d9b}
.ee-workspace-status--danger{background:#fdeceb;color:#b42318}
.ee-job-status-menu{position:relative;flex:0 0 auto}
.ee-job-status-menu>summary{list-style:none;cursor:pointer}
.ee-job-status-menu>summary::-webkit-details-marker{display:none}
.ee-job-status-menu>summary:hover{filter:brightness(0.98)}
.ee-job-status-menu>summary:focus-visible{outline:2px solid #188af0;outline-offset:2px}
.ee-job-status-menu[open]>summary{box-shadow:inset 0 0 0 1px currentColor}
.ee-job-actions-menu{position:relative;flex:0 0 auto}
.ee-job-actions-menu>summary{list-style:none;cursor:pointer;border:1px solid #c9dae8;border-radius:10px;width:40px;height:40px;padding:0;display:inline-flex;align-items:center;justify-content:center;color:#17669e;background:#fff}
.ee-job-actions-menu>summary::-webkit-details-marker{display:none}
.ee-job-actions-menu>summary:hover{background:#eaf5ff;border-color:#9ec7e6}
.ee-job-actions-menu>summary:focus-visible{outline:2px solid #188af0;outline-offset:2px}
.ee-job-actions-menu[open]>summary{background:#eaf5ff;border-color:#0875bd;color:#0875bd}
.ee-job-actions-panel{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:220px;display:grid;gap:2px;padding:6px;border:1px solid #c7dce9;border-radius:10px;background:#fff;box-shadow:0 12px 28px #122b4420}
.ee-job-actions-panel>button[role=menuitem]{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px 12px;border-radius:7px;font:inherit;font-size:13px;font-weight:650;color:#17364c;cursor:pointer}
.ee-job-actions-panel>button[role=menuitem]:hover,.ee-job-actions-panel>button[role=menuitem]:focus-visible{background:#eaf5ff;outline:none}
.ee-job-actions-empty{margin:0;padding:10px 12px;font-size:13px;line-height:1.4}
.ee-job-status-panel{position:absolute;right:0;top:calc(100% + 6px);z-index:40;display:grid;gap:10px;padding:10px;min-width:260px;max-width:min(320px,calc(100vw - 48px));box-sizing:border-box;border:1px solid #c7dce9;border-radius:10px;background:#fff;box-shadow:0 12px 28px #122b4420}
.ee-job-status-form-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.ee-job-status-form-head strong{font-size:14px}
.ee-job-status-form{display:grid;gap:10px}
.ee-job-status-form label{display:grid;gap:5px;min-width:0}
.ee-job-status-form select,.ee-job-status-form textarea{box-sizing:border-box;width:100%;min-width:0;padding:11px 12px;border:1px solid #cdd9e5;border-radius:10px;background:#fff;color:inherit;font:inherit;font-size:16px}
.ee-job-status-form select{min-height:44px}
.ee-job-status-form textarea{resize:vertical;min-height:64px}
.ee-job-status-form .hq-detail-action-primary{justify-self:start;min-height:44px}
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
.ee-job-quotes{display:grid;gap:0}
.ee-job-quote-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
.ee-job-quote-badges{display:flex;flex-wrap:wrap;gap:6px}
.ee-job-quote-primary,.ee-job-quote-kind,.ee-job-quote-current{display:inline-flex;align-items:center;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:800;letter-spacing:.02em}
.ee-job-quote-primary{background:#e7f3ff;color:#076ab5}
.ee-job-quote-current{background:#e8f7ef;color:#0b6b3a}
.ee-job-quote-kind{background:#f2f5f8;color:#4d677a}
.ee-job-quote-create-actions a{display:inline-flex;align-items:center;justify-content:center;border:1px solid #d5e2ef;background:#fff;color:#18577d;border-radius:10px;padding:10px 14px;min-height:44px;font:inherit;font-size:14px;font-weight:750;text-decoration:none}
.ee-job-quote-create-actions a.hq-detail-action-primary{border-color:#1688e9}
.ee-job-quote-create-actions a.hq-detail-action-secondary{background:#fff}
.ee-job-quote-actions{display:flex;flex-wrap:wrap;gap:14px;margin-top:2px}
.ee-section-title .ee-job-quote-create-actions{flex:0 1 auto;justify-content:flex-end}
.ee-job-quote-create-actions{display:flex;flex-wrap:wrap;gap:8px}
.ee-job-quote-create-actions button{border:1px solid #d5e2ef;background:#fff;color:#18577d;border-radius:10px;padding:10px 14px;min-height:44px;font:inherit;font-size:14px;font-weight:750;cursor:pointer}
.ee-job-quote-create-actions button:disabled{opacity:.55;cursor:not-allowed}
.ee-job-quote-create-actions .hq-detail-action-primary{border-color:#1688e9}
@media(max-width:700px){
  .ee-job-quote-head{flex-direction:column;align-items:flex-start}
  .ee-section-title:has(.ee-job-quote-create-actions){align-items:flex-start;flex-direction:column}
  .ee-section-title .ee-job-quote-create-actions{width:100%}
  .ee-job-quote-create-actions a,.ee-job-quote-create-actions button{flex:1 1 calc(50% - 4px);justify-content:center}
}
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
.ee-job-row-main{display:grid;gap:2px;min-width:0;text-align:left;flex:1}
.ee-job-row-main strong{color:#10233a;font-size:15px;font-weight:700;overflow-wrap:anywhere}
.ee-visit-row-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}
.ee-visit-crew-avatars{display:inline-flex;align-items:center;gap:3px}
.ee-visit-crew-avatar{width:24px;height:24px;font-size:9px;flex:none}
.ee-visit-row-end{display:flex;align-items:flex-start;gap:8px;flex:none}
.ee-visit-pills{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:5px;max-width:min(220px,46vw)}
.ee-visit-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;line-height:1.2;white-space:nowrap}
.ee-visit-pill.is-scheduled{background:#eef3f8;color:#45677e}
.ee-visit-pill.is-progress{background:#e7f2ff;color:#0b6cb8}
.ee-visit-pill.is-paused{background:#fff4e4;color:#97571c}
.ee-visit-pill.is-completed{background:#e7f7ee;color:#1b7a45}
.ee-visit-pill.is-unable{background:#fdeeee;color:#a13a3a}
.ee-visit-pill.is-cancelled{background:#eef0f3;color:#5b6672}
.ee-visit-pill.is-followup{background:#fff4e4;color:#97571c;border:1px solid #e4b16d}
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
.ee-time-entry-open{border-color:#9bcbf4;box-shadow:inset 0 0 0 1px #cfe6fb}
.ee-time-entry-main{display:grid;gap:4px;min-width:0}
.ee-time-entry-main p{margin:0;overflow-wrap:anywhere}
.ee-time-entry-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.ee-time-entry-head strong{min-width:0;overflow-wrap:anywhere}
.ee-time-entry-actions,.ee-time-row-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ee-time-approve-btn{border:1px solid #1688e9;border-radius:10px;background:#1688e9;color:#fff;padding:8px 12px;min-height:40px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.ee-time-approve-btn:disabled{opacity:.65;cursor:wait}
.ee-time-flash{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:#e7f3ff}
.ee-time-row-feedback{margin:6px 0 0;max-width:14rem}
.ee-time-status{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.02em;text-transform:capitalize}
.ee-time-status-submitted,.ee-time-status-corrected{color:#9a3412}
.ee-time-status-rejected{color:#b42318}
.ee-time-status-approved{color:#0875c9}
.ee-time-status-active,.ee-time-status-on-break{color:#17669e}
.ee-time-inline-editor{border-top:1px solid #ead9b8;margin-top:4px;padding-top:10px}
.ee-time-inline-form{max-width:720px;padding-top:4px}
.ee-time-editor-row>td{background:#f8fbfe;padding:4px 10px 14px}
.ee-review-cancel{border:1px solid #d4e1ed;border-radius:10px;background:#fff;color:#4d677a;padding:10px 12px;min-height:44px;font:inherit;font-weight:700;cursor:pointer}
.ee-activity-detail{margin:6px 0 0}
.ee-activity-detail>summary{cursor:pointer;color:#0875c9;font-size:13px;font-weight:700;list-style:none}
.ee-activity-detail>summary::-webkit-details-marker{display:none}
.ee-activity-detail p{margin:6px 0 0;font-size:13px;line-height:1.45;overflow-wrap:anywhere}
.ee-update-feed{display:grid;gap:12px;margin-top:12px}
.ee-update-card{border:1px solid #e1e8f0;border-radius:12px;padding:14px;background:#fff;display:grid;gap:10px}
.ee-update-card header{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap}
.ee-update-card header small{color:var(--hq-muted,#738396)}
.ee-update-card p{margin:0;overflow-wrap:anywhere;line-height:1.45}
@media(min-width:900px){
  .ee-time-table-wrap{display:block}
  .ee-time-entry-list{display:none}
  .ee-time-table tbody tr.ee-time-pending-row{background:#fff7eb}
  .ee-time-table tbody tr.ee-time-row-open{background:#eef6fc}
  .ee-time-table th:last-child,.ee-time-table td:last-child{white-space:normal;min-width:9.5rem}
  .ee-time-table tbody th{max-width:14rem;overflow-wrap:anywhere}
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
.ee-schedule-slot-link{margin:0 0 4px}
.ee-schedule-slot-link a{color:#0875c9;font-size:13px;font-weight:750;text-decoration:none}
.ee-schedule-slot-link a:hover{text-decoration:underline}
.ee-schedule-appointment-form .ee-create-staff{margin:0;padding:12px 14px;border:1px solid #cdd9e5;border-radius:11px;background:var(--hq-card,#fff);min-width:0;display:grid;gap:10px}
.ee-schedule-appointment-form .ee-create-staff legend{padding:0 4px;font-size:13px;font-weight:800}
.ee-schedule-appointment-form .ee-create-staff-hint{margin:0;color:var(--hq-muted,#738396);font-size:13px;font-weight:400}
.ee-schedule-appointment-form .ee-create-staff-selected{display:grid;gap:8px}
.ee-schedule-appointment-form .ee-create-staff-pill{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 8px;border:1px solid #d7e3ec;border-radius:12px;background:#f7fafc}
.ee-schedule-appointment-form .ee-create-staff-avatar{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;color:#fff;font-size:11px;font-weight:800;letter-spacing:.02em;flex:0 0 auto}
.ee-schedule-appointment-form .ee-create-staff-name{font-size:13px;font-weight:650;color:#173c54;line-height:1.2}
.ee-schedule-appointment-form .ee-create-staff-remove{margin-left:auto;border:0;background:transparent;color:#0875c9;font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 4px}
.ee-schedule-appointment-form .ee-create-staff-add{justify-self:start;border:1px dashed #9ec4e4;border-radius:999px;background:#f3f8fc;color:#0875c9;padding:9px 14px;font:inherit;font-size:13px;font-weight:750;cursor:pointer}
.ee-schedule-appointment-form .ee-create-staff-add:disabled{opacity:.55;cursor:not-allowed}
.ee-schedule-appointment-form .ee-create-staff-empty{color:var(--hq-muted,#738396);font-size:13px;font-weight:400;margin:0}
.ee-staff-picker-backdrop{position:fixed;inset:0;z-index:80;background:#102c4280;display:grid;place-items:end center;padding:12px}
.ee-staff-picker-dialog{width:min(480px,100%);max-height:min(88dvh,720px);display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:12px;background:#fff;border-radius:16px 16px 12px 12px;padding:16px;box-shadow:0 20px 60px #102c4250}
.ee-staff-picker-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.ee-staff-picker-head strong{font-size:18px;color:#17364b}
.ee-staff-picker-head button{border:0;background:#edf4fa;color:#31536c;width:40px;height:40px;border-radius:10px;font-size:28px;line-height:1;cursor:pointer}
.ee-staff-picker-hint{margin:0;color:#647d91;font-size:13px}
.ee-staff-picker-list{overflow:auto;display:grid;gap:8px;padding-right:2px}
.ee-staff-picker-option{display:flex!important;align-items:center;gap:10px;min-height:48px;padding:8px 10px;border:1px solid #d7e3ec;border-radius:12px;background:#f7fafc;cursor:pointer}
.ee-staff-picker-option.is-selected{border-color:#1688e9;background:#eef6ff}
.ee-staff-picker-option input{width:auto;margin:0;padding:0;flex:0 0 auto;accent-color:#1688e9}
.ee-staff-picker-option .ee-avatar{flex:0 0 auto;width:35px;height:35px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:800;letter-spacing:.02em}
.ee-staff-picker-name{font-size:14px;font-weight:650;color:#173c54;line-height:1.2}
.ee-staff-picker-actions{display:flex;justify-content:flex-end;gap:8px}
.ee-staff-picker-actions button{border:1px solid #cbd8e6;border-radius:9px;background:#fff;color:#31536c;padding:10px 14px;font:inherit;font-weight:700;cursor:pointer}
.ee-staff-picker-actions .ee-staff-picker-confirm{background:#1688e9;border-color:#1688e9;color:#fff}
@media(min-width:761px){
 .ee-staff-picker-backdrop{place-items:center}
 .ee-staff-picker-dialog{border-radius:16px}
}
.ee-review-actions{display:flex;flex-wrap:wrap;gap:8px}
.ee-review-actions button{border:1px solid #d4e1ed;border-radius:10px;background:#fff;color:#17669e;padding:10px 12px;min-height:44px;font:inherit;font-weight:800;cursor:pointer}
.ee-review-actions button:disabled{opacity:.6;cursor:wait}
.ee-review-actions button[value=approve]{background:#1688e9;border-color:#1688e9;color:#fff}
.ee-form-error{margin:0;color:#b42318;font-size:13px;font-weight:700}
.ee-form-success{margin:0;color:#0875c9;font-size:13px;font-weight:700}
.ee-time-calc{display:grid;gap:4px}
.ee-time-calc p{margin:0}
.ee-billable-mode{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:-6px}
.ee-billable-manual{color:#9a3412;font-size:13px;font-weight:700}
.ee-follow-up-resolve{margin-top:12px;padding-top:12px;border-top:1px solid #e1e8f0}
.ee-job-team-avatars{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.ee-avatar{display:grid;place-items:center;background:#e6f1fd;color:#fff;border-radius:50%;width:35px;height:35px;font-size:12px;font-weight:800;letter-spacing:.02em}
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
  .ee-summary,.ee-compact-panel{padding:18px}
  .ee-summary-grid{gap:18px 12px}
  .ee-summary-grid strong{font-size:14px}
  .ee-workspace-status{font-size:12px;padding:6px 9px}
  .ee-summary h2,.ee-section-title h2{font-size:20px}
  .ee-job-stat-grid{grid-template-columns:minmax(0,1fr)}
  .ee-job-number{font-size:12px}
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
  .ee-workspace-head{align-items:flex-start;gap:12px}
  .ee-workspace .ee-section-title{flex-wrap:wrap;align-items:flex-start}
  .ee-workspace .ee-section-title>.ee-muted{width:100%}
  .ee-workspace .ee-summary,.ee-workspace .ee-compact-panel{padding:17px}
  .ee-workspace .ee-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:15px 10px}
  .ee-workspace .ee-workspace-head{gap:12px}
  .ee-workspace .ee-summary-grid strong{font-size:14px}
  .ee-job-stat-grid{grid-template-columns:minmax(0,1fr)}
  .ee-job-tabs{margin-right:-4px}
  .ee-job-provenance{gap:6px}
  .ee-job-provenance-item{flex:0 0 auto;max-width:100%;white-space:normal;overflow-wrap:anywhere}
  .ee-job-provenance-id{white-space:nowrap}
  .ee-visits-section-title h2{margin-bottom:2px}
  .ee-visits-section-stats{margin:0 0 6px}
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

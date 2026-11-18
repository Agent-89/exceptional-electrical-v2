import type { ReactNode } from 'react';
import { staffColor } from '@/lib/staff-color';
import {
  VISIT_OUTCOME_LABELS,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';
import {
  buildJobAttentionItems,
  visitReportStatusCounts,
  type JobDetailAppointment,
  type JobDetailTechReport,
  type JobDetailTimeEntry,
} from '@/lib/job-detail-summary';
import { isFollowUpOutstanding, pickNextFollowUpAppointment } from '@/lib/job-follow-up';
import FollowUpActions from './resolve-follow-up-form';
import JobTimePanel from './job-time-panel';
import JobUpdatesPanel from './job-updates-panel';

function crewInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function visitPrimaryPill(appointment: JobDetailAppointment): { label: string; tone: string } {
  if (appointment.status === 'cancelled') return { label: 'Cancelled', tone: 'cancelled' };
  switch (appointment.fieldStatus) {
    case 'work_completed':
      return { label: 'Completed', tone: 'completed' };
    case 'unable_to_complete':
      return { label: 'Unable to complete', tone: 'unable' };
    case 'in_progress':
      return { label: 'In progress', tone: 'progress' };
    case 'paused':
      return { label: 'Paused', tone: 'paused' };
    default:
      return { label: 'Scheduled', tone: 'scheduled' };
  }
}

function VisitCrewAvatars({
  crew,
}: {
  crew: { id: string; name: string; avatarColor: string | null }[];
}) {
  if (!crew.length) return null;
  return (
    <span className="ee-visit-crew-avatars" aria-label={`Crew: ${crew.map((m) => m.name).join(', ')}`}>
      {crew.map((member) => (
        <span
          key={member.id}
          className="ee-avatar ee-visit-crew-avatar"
          title={member.name}
          style={{ backgroundColor: staffColor(member.id, member.avatarColor) }}
        >
          {crewInitials(member.name)}
        </span>
      ))}
    </span>
  );
}

type NoteView = {
  id: string;
  body: string;
  authorName: string | null;
  visibility: string;
  createdAt: string;
};

type FileView = {
  id: string;
  signedUrl: string | null;
  caption: string | null;
  uploadedByName: string | null;
  contentType: string;
  createdAt: string;
  jobNoteId?: string | null;
};

export type JobFieldSection = 'attention' | 'visits' | 'time' | 'costs' | 'files';

function perthWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', {
    timeZone: 'Australia/Perth',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function perthDayTime(startsAt: string, endsAt: string): string {
  const day = new Date(startsAt).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const start = new Date(startsAt).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  const end = new Date(endsAt).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day} · ${start} – ${end}`;
}

export default function JobFieldActivity({
  jobId,
  appointments,
  techReports,
  timeEntries,
  notes,
  photos,
  section,
  scheduleForm = null,
}: {
  jobId: string;
  appointments: JobDetailAppointment[];
  techReports: JobDetailTechReport[];
  timeEntries: JobDetailTimeEntry[];
  notes: NoteView[];
  photos: FileView[];
  section: JobFieldSection;
  scheduleForm?: ReactNode;
}) {
  const attention = buildJobAttentionItems({ appointments, techReports, timeEntries });
  const visitStats = visitReportStatusCounts({ appointments, techReports });

  if (section === 'attention') {
    return (
      <section className="hq-panel ee-compact-panel ee-attention" id="requires-attention">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">REQUIRES ATTENTION</span>
            <h2>Outstanding actions</h2>
          </div>
        </div>
        {attention.length ? (
          <ul className="ee-attention-list">
            {attention.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span className="ee-muted">{item.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ee-muted" style={{ marginBottom: 0 }}>
            Nothing outstanding on visits, reports or time approvals.
          </p>
        )}
      </section>
    );
  }

  if (section === 'visits') {
    return (
      <section className="hq-panel ee-compact-panel" id="visits-reports">
        <div className="ee-section-title ee-visits-section-title">
          <div>
            <span className="ee-eyebrow">VISITS</span>
            <h2>Appointments and summaries</h2>
          </div>
        </div>
        <p className="ee-muted ee-visits-section-stats">
          {visitStats.visitCount} visit{visitStats.visitCount === 1 ? '' : 's'} ·{' '}
          {visitStats.summaryCount} summar{visitStats.summaryCount === 1 ? 'y' : 'ies'} ·{' '}
          {visitStats.completedCount} completed
          {visitStats.pendingOutcomeCount
            ? ` · ${visitStats.pendingOutcomeCount} open outcome${visitStats.pendingOutcomeCount === 1 ? '' : 's'}`
            : ''}
        </p>
        {appointments.length ? (
          appointments.map((appointment) => {
            const reportsForVisit = techReports.filter(
              (report) => report.appointmentId === appointment.id,
            );
            const crew =
              appointment.crew?.length
                ? appointment.crew
                : (appointment.electricianNames ?? []).map((name, index) => ({
                    id: `${appointment.id}-name-${index}`,
                    name,
                    avatarColor: null as string | null,
                  }));
            const crewById = new Map(crew.map((member) => [member.id, member]));
            const crewByName = new Map(crew.map((member) => [member.name.toLowerCase(), member]));
            const primaryPill = visitPrimaryPill(appointment);
            const furtherOutstanding = isFollowUpOutstanding(appointment);
            const nextVisit = furtherOutstanding
              ? pickNextFollowUpAppointment({
                  sourceAppointmentId: appointment.id,
                  sourceStartsAt: appointment.startsAt,
                  candidates: appointments.map((candidate) => ({
                    id: candidate.id,
                    startsAt: candidate.startsAt,
                    status: candidate.status,
                  })),
                })
              : null;
            const nextVisitFull = nextVisit
              ? appointments.find((candidate) => candidate.id === nextVisit.id)
              : null;
            const linkedVisit = appointment.followUpLinkedAppointmentId
              ? appointments.find((candidate) => candidate.id === appointment.followUpLinkedAppointmentId)
              : null;
            return (
              <details className="ee-expand ee-job-row" key={appointment.id}>
                <summary>
                  <span className="ee-job-row-main">
                    <strong>{perthDayTime(appointment.startsAt, appointment.endsAt)}</strong>
                    <span className="ee-visit-row-meta">
                      <VisitCrewAvatars crew={crew} />
                    </span>
                  </span>
                  <span className="ee-visit-row-end">
                    <span className="ee-visit-pills">
                      <span className={`ee-visit-pill is-${primaryPill.tone}`}>{primaryPill.label}</span>
                      {furtherOutstanding ? (
                        <span className="ee-visit-pill is-followup">Further visit</span>
                      ) : null}
                    </span>
                    <span className="ee-expand-mark" aria-hidden="true">
                      ＋
                    </span>
                  </span>
                </summary>
                <div className="ee-job-row-body">
                  {appointment.scheduleNotes ? <p>Instructions: {appointment.scheduleNotes}</p> : null}

                  <div className="ee-job-subblock">
                    <strong>Visit summary</strong>
                    {appointment.completionNote ? <p style={{ whiteSpace: 'pre-wrap' }}>{appointment.completionNote}</p> : null}
                    {appointment.outstanding ? (
                      <p style={{ whiteSpace: 'pre-wrap' }}>Outstanding: {appointment.outstanding}</p>
                    ) : null}
                    {appointment.issues ? (
                      <p style={{ whiteSpace: 'pre-wrap' }}>Issues: {appointment.issues}</p>
                    ) : null}
                    {!appointment.completionNote &&
                    !appointment.outstanding &&
                    !appointment.issues ? (
                      <p className="ee-muted">No visit summary yet.</p>
                    ) : null}
                    {furtherOutstanding ? (
                      <p className="ee-muted" style={{ marginBottom: 0 }}>
                        Further visit required
                      </p>
                    ) : appointment.followUp ? (
                      <p className="ee-muted" style={{ marginBottom: 0 }}>
                        Further visit resolved
                        {linkedVisit
                          ? ` · linked to ${perthDayTime(linkedVisit.startsAt, linkedVisit.endsAt)}`
                          : ''}
                      </p>
                    ) : null}
                    {appointment.followUpResolvedAt ? (
                      <p className="ee-muted">
                        Resolved {perthWhen(appointment.followUpResolvedAt)}
                        {appointment.followUpResolutionNote
                          ? ` · ${appointment.followUpResolutionNote}`
                          : ''}
                      </p>
                    ) : null}
                  </div>

                  {furtherOutstanding ? (
                    <FollowUpActions
                      jobId={jobId}
                      appointmentId={appointment.id}
                      nextVisitId={nextVisit?.id ?? null}
                      nextVisitLabel={
                        nextVisitFull
                          ? perthDayTime(nextVisitFull.startsAt, nextVisitFull.endsAt)
                          : null
                      }
                    />
                  ) : null}

                  <div className="ee-job-subblock">
                    <strong>Summaries</strong>
                    {reportsForVisit.length ? (
                      <ul className="ee-tech-summaries">
                        {reportsForVisit.map((report) => {
                          const member =
                            (report.staffId ? crewById.get(report.staffId) : undefined) ??
                            (report.technicianName
                              ? crewByName.get(report.technicianName.toLowerCase())
                              : undefined);
                          const avatarId = member?.id ?? report.staffId ?? report.id;
                          const avatarName = member?.name ?? report.technicianName ?? 'Technician';
                          const outcome =
                            VISIT_OUTCOME_LABELS[report.progressStatus as VisitOutcomeStatus] ??
                            report.progressStatus;
                          return (
                            <li key={report.id} className="ee-tech-summary-row">
                              <span
                                className="ee-avatar ee-visit-crew-avatar"
                                title={avatarName}
                                style={{
                                  backgroundColor: staffColor(avatarId, member?.avatarColor ?? null),
                                }}
                              >
                                {crewInitials(avatarName)}
                              </span>
                              <div className="ee-tech-summary-body">
                                <div className="ee-tech-summary-head">
                                  <strong>{avatarName}</strong>
                                  <span className="ee-muted">{outcome}</span>
                                </div>
                                {report.workSummary ? (
                                  <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{report.workSummary}</p>
                                ) : (
                                  <p className="ee-muted" style={{ margin: 0 }}>
                                    No summary yet
                                  </p>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="ee-muted">No summaries yet</p>
                    )}
                  </div>
                </div>
              </details>
            );
          })
        ) : (
          <p className="ee-muted">No visits scheduled yet.</p>
        )}
        {scheduleForm}
      </section>
    );
  }

  if (section === 'time') {
    return <JobTimePanel jobId={jobId} timeEntries={timeEntries} />;
  }

  if (section === 'costs') {
    return (
      <section className="hq-panel ee-compact-panel" id="materials-costing">
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">COSTS</span>
            <h2>Materials and job costing</h2>
          </div>
        </div>
        <p className="ee-muted" style={{ marginBottom: 0 }}>
          Materials and cost rollups will appear here. No estimated or fabricated figures are
          shown until costing data is available.
        </p>
      </section>
    );
  }

  if (section === 'files') {
    return (
      <JobUpdatesPanel
        jobId={jobId}
        notes={notes}
        photos={photos.map((photo) => ({
          id: photo.id,
          signedUrl: photo.signedUrl,
          caption: photo.caption,
          uploadedByName: photo.uploadedByName,
          contentType: photo.contentType,
          createdAt: photo.createdAt,
          jobNoteId: photo.jobNoteId ?? null,
        }))}
      />
    );
  }

  return null;
}

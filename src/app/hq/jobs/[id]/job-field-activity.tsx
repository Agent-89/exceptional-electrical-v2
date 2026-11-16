import type { ReactNode } from 'react';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import {
  VISIT_OUTCOME_LABELS,
  isTerminalVisitOutcome,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';
import {
  buildJobAttentionItems,
  summarizeTechReport,
  visitReportStatusCounts,
  type JobDetailAppointment,
  type JobDetailTechReport,
  type JobDetailTimeEntry,
} from '@/lib/job-detail-summary';
import { isFollowUpOutstanding } from '@/lib/job-follow-up';
import OfficeVisitOutcomeForm from './office-visit-outcome-form';
import ResolveFollowUpForm from './resolve-follow-up-form';
import JobTimePanel from './job-time-panel';
import JobUpdatesPanel from './job-updates-panel';

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
          <span className="ee-muted">{attention.length}</span>
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
        <div className="ee-section-title">
          <div>
            <span className="ee-eyebrow">VISITS</span>
            <h2>Appointments and technician reports</h2>
          </div>
          <span className="ee-muted">{appointments.length}</span>
        </div>
        <p className="ee-muted" style={{ marginTop: 0 }}>
          {visitStats.visitCount} visit{visitStats.visitCount === 1 ? '' : 's'} ·{' '}
          {visitStats.reportCount} report{visitStats.reportCount === 1 ? '' : 's'} ·{' '}
          {visitStats.finalisedCount} finalised
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
              appointment.electricianNames && appointment.electricianNames.length
                ? appointment.electricianNames.join(', ')
                : 'Visit crew not listed';
            return (
              <details className="ee-expand ee-job-row" key={appointment.id}>
                <summary>
                  <span className="ee-job-row-main">
                    <strong>{perthDayTime(appointment.startsAt, appointment.endsAt)}</strong>
                    <span className="ee-muted">
                      {FIELD_STATUS_LABELS[appointment.fieldStatus as FieldStatus] ??
                        appointment.fieldStatus}
                      {isFollowUpOutstanding(appointment)
                        ? ' · Further visit outstanding'
                        : appointment.followUp && appointment.followUpResolvedAt
                          ? ' · Further visit resolved'
                          : ''}
                      {reportsForVisit.length
                        ? ` · ${reportsForVisit.length} report${reportsForVisit.length === 1 ? '' : 's'}`
                        : ' · No reports'}
                    </span>
                  </span>
                  <span className="ee-expand-mark" aria-hidden="true">
                    ＋
                  </span>
                </summary>
                <div className="ee-job-row-body">
                  <p className="ee-muted" style={{ marginTop: 0 }}>
                    Schedule {appointment.status} · Visit electricians: {crew}
                  </p>
                  {appointment.scheduleNotes ? <p>Instructions: {appointment.scheduleNotes}</p> : null}

                  <div className="ee-job-subblock">
                    <strong>Shared office summary</strong>
                    {appointment.completionNote ? <p>{appointment.completionNote}</p> : null}
                    {appointment.outstanding ? <p>Outstanding: {appointment.outstanding}</p> : null}
                    {appointment.issues ? <p>Issues: {appointment.issues}</p> : null}
                    {!appointment.completionNote &&
                    !appointment.outstanding &&
                    !appointment.issues ? (
                      <p className="ee-muted">No shared summary yet.</p>
                    ) : null}
                    <p className="ee-muted" style={{ marginBottom: 0 }}>
                      Further visit required:{' '}
                      {isFollowUpOutstanding(appointment)
                        ? 'Yes · outstanding'
                        : appointment.followUp
                          ? 'Yes · resolved by office'
                          : 'No'}
                      {isTerminalVisitOutcome(appointment.fieldStatus) ? ' · Finalised' : ''}
                    </p>
                    {appointment.followUpResolvedAt ? (
                      <p className="ee-muted">
                        Resolved {perthWhen(appointment.followUpResolvedAt)}
                        {appointment.followUpResolutionNote
                          ? ` · ${appointment.followUpResolutionNote}`
                          : ''}
                      </p>
                    ) : null}
                  </div>

                  {isFollowUpOutstanding(appointment) ? (
                    <ResolveFollowUpForm
                      jobId={jobId}
                      appointmentId={appointment.id}
                      linkOptions={appointments
                        .filter(
                          (candidate) =>
                            candidate.id !== appointment.id &&
                            candidate.status !== 'cancelled' &&
                            new Date(candidate.startsAt).getTime() >=
                              new Date(appointment.startsAt).getTime(),
                        )
                        .map((candidate) => ({
                          id: candidate.id,
                          label: perthDayTime(candidate.startsAt, candidate.endsAt),
                        }))}
                    />
                  ) : null}

                  <div className="ee-job-subblock">
                    <strong>Technician reports</strong>
                    {reportsForVisit.length ? (
                      <ul className="ee-report-summaries">
                        {reportsForVisit.map((report) => (
                          <li key={report.id}>
                            <details className="ee-expand ee-nested-expand">
                              <summary>
                                <span>
                                  <strong>{report.technicianName ?? 'Technician'}</strong>
                                  <span className="ee-muted">
                                    {' '}
                                    · {summarizeTechReport(report)}
                                  </span>
                                </span>
                                <span className="ee-expand-mark" aria-hidden="true">
                                  ＋
                                </span>
                              </summary>
                              <div className="ee-job-row-body">
                                <p className="ee-muted" style={{ marginTop: 0 }}>
                                  {VISIT_OUTCOME_LABELS[report.progressStatus as VisitOutcomeStatus] ??
                                    report.progressStatus}{' '}
                                  · Updated {perthWhen(report.updatedAt)}
                                </p>
                                {report.workSummary ? <p>{report.workSummary}</p> : null}
                                {report.outstandingWork ? (
                                  <p>Outstanding: {report.outstandingWork}</p>
                                ) : null}
                                {report.issues ? <p>Issues: {report.issues}</p> : null}
                                <p className="ee-muted" style={{ marginBottom: 0 }}>
                                  Further visit: {report.followUpRequired ? 'Yes' : 'No'}
                                </p>
                              </div>
                            </details>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="ee-muted">No individual technician work reports yet.</p>
                    )}
                  </div>

                  {!isTerminalVisitOutcome(appointment.fieldStatus) ? (
                    <OfficeVisitOutcomeForm
                      appointmentId={appointment.id}
                      fieldStatus={appointment.fieldStatus}
                      completionNote={appointment.completionNote}
                      outstanding={appointment.outstanding}
                      issues={appointment.issues}
                      followUp={appointment.followUp}
                    />
                  ) : null}
                </div>
              </details>
            );
          })
        ) : (
          <p className="ee-muted">No visits scheduled yet.</p>
        )}
        {scheduleForm ? (
          <details className="ee-expand">
            <summary>
              + Schedule a visit
              <span className="ee-expand-mark" aria-hidden="true">
                ＋
              </span>
            </summary>
            {scheduleForm}
          </details>
        ) : null}
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

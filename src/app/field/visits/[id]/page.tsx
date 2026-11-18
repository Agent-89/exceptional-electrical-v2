import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTechnicianCrew } from '@/lib/hq-auth';
import { getTechnicianAppointment } from '@/lib/tech-appointments';
import {
  formatJobNumber,
  formatPerthDateLong,
  formatPerthTime,
  mapsDirectionsUrl,
  perthDayKey,
} from '@/lib/perth-day';
import { listJobAttachments, listJobNotes, signAttachmentUrls } from '@/lib/tech-field';
import type { FieldStatus } from '@/lib/tech-field-constants';
import { FIELD_STATUS_LABELS } from '@/lib/tech-field-constants';
import {
  getActiveTimeEntryForTechnician,
  listTimeEntriesForAppointment,
  liveBreakMinutes,
  liveWorkedMinutes,
  schedulingStaffNamesByIds,
} from '@/lib/tech-time';
import { elapsedWholeMinutes } from '@/lib/tech-time-format';
import {
  fieldsFromTechWorkReportRow,
  getTechWorkReportForTechnician,
} from '@/lib/tech-work-reports';
import { seedTechWorkReportFromShared } from '@/lib/tech-visit-report';
import { HydrateVisitSnapshot } from '../../field-offline-hydrate';
import TechStyles from '../../tech-styles';
import VisitFieldOps from './visit-field-ops';
import '@/app/hq/hq.css';

export const dynamic = 'force-dynamic';

export default async function TechVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ time?: string }>;
}) {
  const crew = await requireTechnicianCrew();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const visit = await getTechnicianAppointment(crew.staffId, id);
  if (!visit) {
    notFound();
  }

  const [entries, active, notes, attachments, ownReport] = await Promise.all([
    listTimeEntriesForAppointment(visit.appointmentId),
    getActiveTimeEntryForTechnician(crew.id),
    listJobNotes({
      jobId: visit.jobId,
      appointmentId: visit.appointmentId,
      includeOfficeOnly: false,
    }),
    listJobAttachments({ jobId: visit.jobId, appointmentId: visit.appointmentId }),
    getTechWorkReportForTechnician({
      appointmentId: visit.appointmentId,
      technicianUserId: crew.id,
    }),
  ]);
  const [staffNames, photos] = await Promise.all([
    schedulingStaffNamesByIds(entries.map((e) => e.staffId)),
    signAttachmentUrls(attachments, 600),
  ]);

  const personalFields = ownReport
    ? fieldsFromTechWorkReportRow(ownReport)
    : seedTechWorkReportFromShared({
        completionNote: visit.fieldCompletionNote,
        outstandingWork: visit.fieldOutstandingWork,
        issues: visit.fieldIssues,
        followUpRequired: visit.fieldFollowUpRequired,
        fieldStatus: visit.fieldStatus,
      });

  const activeOnThisVisit =
    active && active.appointmentId === visit.appointmentId
      ? {
          id: active.id,
          staffName: staffNames.get(active.staffId) ?? 'Technician',
          status: active.status,
          startedAt: active.startedAt,
          endedAt: active.endedAt,
          breakStartedAt: active.breakStartedAt,
          breakMinutes: active.breakMinutes,
          workedMinutes: active.workedMinutes,
          liveWorkedMinutes: liveWorkedMinutes(active),
          liveBreakMinutes: liveBreakMinutes(active),
          note: active.note,
          entrySource: active.entrySource,
        }
      : null;

  const entryViews = entries.map((e) => ({
    id: e.id,
    staffName: staffNames.get(e.staffId) ?? 'Technician',
    status: e.status,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    breakStartedAt: e.breakStartedAt,
    breakMinutes: e.breakMinutes,
    workedMinutes: e.workedMinutes,
    liveWorkedMinutes: liveWorkedMinutes(e),
    liveBreakMinutes: liveBreakMinutes(e),
    note: e.note,
    entrySource: e.entrySource,
  }));

  const scheduledMinutes = elapsedWholeMinutes(visit.startsAt, visit.endsAt);
  const fieldStatus = visit.fieldStatus as FieldStatus;
  const jobNumber = formatJobNumber(visit.jobNumber);
  const appointmentTime = `${formatPerthTime(visit.startsAt)} – ${formatPerthTime(visit.endsAt)}`;

  return (
    <main className="ee-tech ee-tech-visit-page">
      <TechStyles />
      <HydrateVisitSnapshot
        staffId={crew.staffId}
        snapshot={{
          staffId: crew.staffId,
          appointmentId: visit.appointmentId,
          summary: {
            title: visit.title,
            jobNumber,
            customerName: visit.customerName ?? '',
            siteAddress: visit.siteAddress ?? '',
            scheduledLabel: `${formatPerthDateLong(visit.startsAt)} · ${appointmentTime}`,
            fieldStatus,
            electricianNames: visit.electricianNames,
          },
        }}
      />
      <Link className="hq-back" href="/field">
        ← Today
      </Link>

      <header className="ee-tech-overview" aria-labelledby="visit-job-title">
        <div className="ee-tech-overview-top">
          <span className="hq-kicker">JOB {jobNumber}</span>
          <span className="ee-tech-status ee-tech-status-field" title="Current visit status">
            {FIELD_STATUS_LABELS[fieldStatus] ?? fieldStatus.replaceAll('_', ' ')}
          </span>
        </div>
        <h1 id="visit-job-title">{visit.title}</h1>
        <div className="ee-tech-overview-meta">
          <p className="ee-tech-overview-line">
            <span className="ee-tech-overview-label">Customer</span>
            <span>
              {visit.customerName ?? 'Not assigned'}
              {visit.customerPhone ? (
                <>
                  {' · '}
                  <a href={'tel:' + visit.customerPhone}>{visit.customerPhone}</a>
                </>
              ) : null}
            </span>
          </p>
          <p className="ee-tech-overview-line">
            <span className="ee-tech-overview-label">Site</span>
            <span>
              {visit.siteAddress || 'Address needed'}
              {visit.siteAddress ? (
                <>
                  {' · '}
                  <a href={mapsDirectionsUrl(visit.siteAddress)} target="_blank" rel="noopener noreferrer">
                    Directions
                  </a>
                </>
              ) : null}
            </span>
          </p>
          <p className="ee-tech-overview-line">
            <span className="ee-tech-overview-label">Appointment</span>
            <span>
              {formatPerthDateLong(visit.startsAt)} · {appointmentTime}
            </span>
          </p>
        </div>
      </header>

      {active && active.appointmentId !== visit.appointmentId ? (
        <p className="ee-tech-alert" role="status">
          You have an active timer on another visit. Finish or pause it before starting work here.
        </p>
      ) : null}

      <VisitFieldOps
        key={visit.appointmentId}
        staffId={crew.staffId}
        appointmentId={visit.appointmentId}
        appointmentDateLabel={formatPerthDateLong(visit.startsAt)}
        visitDayKey={perthDayKey(visit.startsAt)}
        scheduledLabel={appointmentTime}
        scheduledMinutes={scheduledMinutes}
        fieldStatus={fieldStatus}
        assignedTechnicianCount={visit.electricianNames.length || 1}
        timeRecorded={query.time === 'recorded'}
        activeEntry={activeOnThisVisit}
        entries={entryViews}
        notes={notes.map((n) => ({
          id: n.id,
          body: n.body,
          authorName: n.authorName,
          createdAt: n.createdAt,
          editedAt: n.editedAt,
          isOwn: n.authorId === crew.id,
        }))}
        photos={photos.map((p) => ({
          id: p.id,
          signedUrl: p.signedUrl ?? null,
          caption: p.caption,
          createdAt: p.createdAt,
          contentType: p.contentType,
          jobNoteId: p.jobNoteId ?? null,
        }))}
        completionNote={personalFields.workSummary}
        outstandingWork={personalFields.outstandingWork}
        issues={personalFields.issues}
        followUpRequired={personalFields.followUpRequired}
        personalProgressStatus={personalFields.progressStatus}
        techReportUpdatedAt={ownReport?.updatedAt ?? null}
        sharedCompletionNote={visit.fieldCompletionNote}
        sharedOutstandingWork={visit.fieldOutstandingWork}
        sharedIssues={visit.fieldIssues}
        sharedFollowUpRequired={visit.fieldFollowUpRequired}
        hasPersonalReport={Boolean(ownReport)}
        visitNotes={visit.visitNotes}
        jobDescription={visit.description}
        electricianNames={visit.electricianNames}
      />

      <div className="ee-tech-actions ee-tech-footer-link">
        <Link className="ee-tech-btn ee-tech-btn-ghost" href={'/field/jobs/' + visit.jobId}>
          All your visits on this job
        </Link>
      </div>
    </main>
  );
}

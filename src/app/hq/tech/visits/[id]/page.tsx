import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTechnicianCrew } from '@/lib/hq-auth';
import { getTechnicianAppointment } from '@/lib/tech-appointments';
import {
  formatJobNumber,
  formatPerthDateLong,
  formatPerthTime,
  mapsDirectionsUrl,
} from '@/lib/perth-day';
import { JOB_STATUS_LABELS } from '@/lib/job-statuses';
import { listJobAttachments, listJobNotes, signAttachmentUrls } from '@/lib/tech-field';
import type { FieldStatus } from '@/lib/tech-field-constants';
import {
  getActiveTimeEntryForTechnician,
  listTimeEntriesForAppointment,
  liveBreakMinutes,
  liveWorkedMinutes,
} from '@/lib/tech-time';
import { elapsedWholeMinutes } from '@/lib/tech-time-format';
import TechStyles from '../../tech-styles';
import VisitFieldOps from './visit-field-ops';
import '../../../hq.css';

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

  const [entries, active, notes, attachments] = await Promise.all([
    listTimeEntriesForAppointment(visit.appointmentId),
    getActiveTimeEntryForTechnician(crew.id),
    listJobNotes({
      jobId: visit.jobId,
      appointmentId: visit.appointmentId,
      includeOfficeOnly: false,
    }),
    listJobAttachments({ jobId: visit.jobId, appointmentId: visit.appointmentId }),
  ]);
  const photos = await signAttachmentUrls(attachments, 600);

  const activeOnThisVisit =
    active && active.appointmentId === visit.appointmentId
      ? {
          id: active.id,
          status: active.status,
          startedAt: active.startedAt,
          endedAt: active.endedAt,
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
    status: e.status,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    breakMinutes: e.breakMinutes,
    workedMinutes: e.workedMinutes,
    liveWorkedMinutes: liveWorkedMinutes(e),
    liveBreakMinutes: liveBreakMinutes(e),
    note: e.note,
    entrySource: e.entrySource,
  }));

  const scheduledMinutes = elapsedWholeMinutes(visit.startsAt, visit.endsAt);

  return (
    <main className="ee-tech">
      <TechStyles />
      <Link className="hq-back" href="/hq/tech">
        ← Today
      </Link>
      <header className="ee-tech-head">
        <div className="hq-kicker">VISIT · {formatJobNumber(visit.jobNumber)}</div>
        <h1>{visit.title}</h1>
        <p>
          <span className="ee-tech-status">
            {JOB_STATUS_LABELS[visit.jobStatus as keyof typeof JOB_STATUS_LABELS] ?? visit.jobStatus}
          </span>{' '}
          <span className="ee-tech-muted">
            · Visit {visit.visitStatus} · Field {visit.fieldStatus.replaceAll('_', ' ')}
          </span>
        </p>
      </header>

      {active && active.appointmentId !== visit.appointmentId ? (
        <p className="ee-tech-alert" role="status">
          You have an active timer on another visit. Finish or pause it before starting work here.
        </p>
      ) : null}

      <section className="ee-tech-panel">
        <h2>Appointment</h2>
        <dl className="ee-tech-dl">
          <div>
            <dt>Date</dt>
            <dd>{formatPerthDateLong(visit.startsAt)}</dd>
          </div>
          <div>
            <dt>Scheduled time</dt>
            <dd>
              {formatPerthTime(visit.startsAt)} – {formatPerthTime(visit.endsAt)}
            </dd>
          </div>
          <div>
            <dt>Instructions</dt>
            <dd>{visit.visitNotes || 'No appointment instructions.'}</dd>
          </div>
          {visit.electricianNames.length ? (
            <div>
              <dt>Assigned electricians</dt>
              <dd>{visit.electricianNames.join(', ')}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="ee-tech-panel">
        <h2>Job details</h2>
        <dl className="ee-tech-dl">
          <div>
            <dt>Customer</dt>
            <dd>
              {visit.customerName ?? 'Not assigned'}
              {visit.customerPhone ? (
                <>
                  <br />
                  <a href={'tel:' + visit.customerPhone}>{visit.customerPhone}</a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Worksite</dt>
            <dd>
              {visit.siteAddress || 'Address needed'}
              {visit.siteAddress ? (
                <>
                  <br />
                  <a href={mapsDirectionsUrl(visit.siteAddress)} target="_blank" rel="noopener noreferrer">
                    Open directions ↗
                  </a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{visit.description || 'No work description added yet.'}</dd>
          </div>
        </dl>
      </section>

      <VisitFieldOps
        appointmentId={visit.appointmentId}
        appointmentDateLabel={formatPerthDateLong(visit.startsAt)}
        scheduledLabel={`${formatPerthTime(visit.startsAt)} – ${formatPerthTime(visit.endsAt)}`}
        scheduledMinutes={scheduledMinutes}
        fieldStatus={visit.fieldStatus as FieldStatus}
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
        }))}
        completionNote={visit.fieldCompletionNote}
        outstandingWork={visit.fieldOutstandingWork}
        issues={visit.fieldIssues}
        followUpRequired={visit.fieldFollowUpRequired}
      />

      <div className="ee-tech-actions">
        <Link className="ee-tech-btn ee-tech-btn-secondary" href={'/hq/tech/jobs/' + visit.jobId}>
          All your visits on this job
        </Link>
      </div>
    </main>
  );
}

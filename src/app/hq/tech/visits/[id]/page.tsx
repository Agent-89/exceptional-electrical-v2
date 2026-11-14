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
import TechStyles from '../../tech-styles';
import '../../../hq.css';

export const dynamic = 'force-dynamic';

export default async function TechVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const crew = await requireTechnicianCrew();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const visit = await getTechnicianAppointment(crew.staffId, id);
  if (!visit) {
    // Deny unassigned / other techs' visits without exposing office job pages.
    notFound();
  }

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
          <span className="ee-tech-muted">· Visit {visit.visitStatus}</span>
        </p>
      </header>

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

      <div className="ee-tech-actions">
        <Link className="ee-tech-btn ee-tech-btn-secondary" href={'/hq/tech/jobs/' + visit.jobId}>
          All your visits on this job
        </Link>
      </div>
    </main>
  );
}

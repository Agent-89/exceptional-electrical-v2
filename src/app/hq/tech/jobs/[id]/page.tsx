import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireTechnicianCrew } from '@/lib/hq-auth';
import { listAuthorizedJobVisits } from '@/lib/tech-appointments';
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

export default async function TechJobPage({ params }: { params: Promise<{ id: string }> }) {
  const crew = await requireTechnicianCrew();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { sample, visits } = await listAuthorizedJobVisits(crew.staffId, id);
  if (!sample || !visits.length) notFound();

  return (
    <main className="ee-tech">
      <TechStyles />
      <Link className="hq-back" href="/hq/tech/jobs">
        ← My jobs
      </Link>
      <header className="ee-tech-head">
        <div className="hq-kicker">JOB {formatJobNumber(sample.jobNumber)}</div>
        <h1>{sample.title}</h1>
        <p>
          <span className="ee-tech-status">
            {JOB_STATUS_LABELS[sample.jobStatus as keyof typeof JOB_STATUS_LABELS] ?? sample.jobStatus}
          </span>
        </p>
      </header>

      <section className="ee-tech-panel">
        <h2>Job brief</h2>
        <dl className="ee-tech-dl">
          <div>
            <dt>Customer</dt>
            <dd>
              {sample.customerName ?? 'Not assigned'}
              {sample.customerPhone ? (
                <>
                  <br />
                  <a href={'tel:' + sample.customerPhone}>{sample.customerPhone}</a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Worksite</dt>
            <dd>
              {sample.siteAddress || 'Address needed'}
              {sample.siteAddress ? (
                <>
                  <br />
                  <a href={mapsDirectionsUrl(sample.siteAddress)} target="_blank" rel="noopener noreferrer">
                    Open directions ↗
                  </a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{sample.description || 'No work description added yet.'}</dd>
          </div>
        </dl>
      </section>

      <section className="ee-tech-panel">
        <h2>Your visits</h2>
        {visits.map((visit) => (
          <div className="ee-tech-visit" key={visit.appointmentId}>
            <strong>{formatPerthDateLong(visit.startsAt)}</strong>
            <span className="ee-tech-muted">
              {formatPerthTime(visit.startsAt)} – {formatPerthTime(visit.endsAt)} · {visit.visitStatus}
            </span>
            {visit.visitNotes ? <p>{visit.visitNotes}</p> : null}
            <div className="ee-tech-actions">
              <Link className="ee-tech-btn ee-tech-btn-primary" href={'/hq/tech/visits/' + visit.appointmentId}>
                Open visit
              </Link>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}

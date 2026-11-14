import Link from 'next/link';
import { requireTechnicianCrew } from '@/lib/hq-auth';
import { listTechnicianTodayAndUpcoming } from '@/lib/tech-appointments';
import {
  formatJobNumber,
  formatPerthDate,
  formatPerthTime,
  mapsDirectionsUrl,
} from '@/lib/perth-day';
import { JOB_STATUS_LABELS } from '@/lib/job-statuses';
import TechStyles from './tech-styles';
import '../hq.css';

export const dynamic = 'force-dynamic';

export default async function TechTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const crew = await requireTechnicianCrew();
  const { denied } = await searchParams;
  const { todayKey, today, upcoming } = await listTechnicianTodayAndUpcoming(crew.staffId);
  const todayLabel = new Date(todayKey + 'T12:00:00+08:00').toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <main className="ee-tech">
      <TechStyles />
      <header className="ee-tech-head">
        <div className="hq-kicker">TECHNICIAN · TODAY</div>
        <h1>Today</h1>
        <p>
          {todayLabel} · {crew.crewName}
        </p>
      </header>
      {denied ? (
        <p className="ee-tech-alert ee-tech-alert-error" role="alert">
          That visit is not assigned to you.
        </p>
      ) : null}

      <section className="ee-tech-section" aria-labelledby="tech-today-title">
        <h2 id="tech-today-title">Today’s appointments</h2>
        {today.length ? (
          today.map((visit) => (
            <article key={visit.appointmentId} className="ee-tech-card">
              <div className="ee-tech-card-meta">
                <strong>
                  {formatPerthTime(visit.startsAt)} – {formatPerthTime(visit.endsAt)}
                </strong>
                <span className="ee-tech-status">{visit.visitStatus}</span>
              </div>
              <h3>
                {formatJobNumber(visit.jobNumber)} · {visit.title}
              </h3>
              <p>{visit.customerName ?? 'Customer not assigned'}</p>
              <p className="ee-tech-muted">{visit.siteAddress || 'Address needed'}</p>
              <div className="ee-tech-actions">
                <Link className="ee-tech-btn ee-tech-btn-primary" href={'/hq/tech/visits/' + visit.appointmentId}>
                  View job
                </Link>
                {visit.siteAddress ? (
                  <a
                    className="ee-tech-btn ee-tech-btn-secondary"
                    href={mapsDirectionsUrl(visit.siteAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions
                  </a>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="ee-tech-empty">
            <strong>No appointments today</strong>
            <p>You have no scheduled visits for today in Perth time. Check upcoming jobs below.</p>
          </div>
        )}
      </section>

      <section className="ee-tech-section" aria-labelledby="tech-upcoming-title">
        <h2 id="tech-upcoming-title">Upcoming</h2>
        {upcoming.length ? (
          upcoming.map((visit) => (
            <article key={visit.appointmentId} className="ee-tech-card">
              <div className="ee-tech-card-meta">
                <strong>
                  {formatPerthDate(visit.startsAt)} · {formatPerthTime(visit.startsAt)} –{' '}
                  {formatPerthTime(visit.endsAt)}
                </strong>
                <span className="ee-tech-muted">
                  {JOB_STATUS_LABELS[visit.jobStatus as keyof typeof JOB_STATUS_LABELS] ?? visit.jobStatus}
                </span>
              </div>
              <h3>
                {formatJobNumber(visit.jobNumber)} · {visit.title}
              </h3>
              <p>{visit.customerName ?? 'Customer not assigned'}</p>
              <p className="ee-tech-muted">{visit.siteAddress || 'Address needed'}</p>
              <div className="ee-tech-actions">
                <Link className="ee-tech-btn ee-tech-btn-primary" href={'/hq/tech/visits/' + visit.appointmentId}>
                  View job
                </Link>
                {visit.siteAddress ? (
                  <a
                    className="ee-tech-btn ee-tech-btn-secondary"
                    href={mapsDirectionsUrl(visit.siteAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions
                  </a>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="ee-tech-empty">
            <strong>Nothing coming up</strong>
            <p>No scheduled visits in the next two weeks. Office will assign appointments when ready.</p>
          </div>
        )}
      </section>
    </main>
  );
}

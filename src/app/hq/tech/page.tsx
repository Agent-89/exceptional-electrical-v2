import Link from 'next/link';
import { requireTechnicianCrew } from '@/lib/hq-auth';
import {
  listTechnicianDaySchedule,
  listTechnicianTodayAndUpcoming,
} from '@/lib/tech-appointments';
import {
  formatJobNumber,
  formatPerthDate,
  formatPerthTime,
  mapsDirectionsUrl,
  perthDayKey,
} from '@/lib/perth-day';
import {
  formatPerthDayNavLabel,
  shiftPerthDayKey,
} from '@/lib/day-timeline-layout';
import { JOB_STATUS_LABELS } from '@/lib/job-statuses';
import TechDayCalendar from './tech-day-calendar';
import TechStyles from './tech-styles';
import '../hq.css';

export const dynamic = 'force-dynamic';

function resolveDayParam(raw: string | undefined, todayKey: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayKey;
}

export default async function TechTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; day?: string }>;
}) {
  const crew = await requireTechnicianCrew();
  const params = await searchParams;
  const todayKey = perthDayKey();
  const selectedDay = resolveDayParam(params.day, todayKey);
  const dayVisits = await listTechnicianDaySchedule(crew.staffId, selectedDay);
  const { upcoming } = await listTechnicianTodayAndUpcoming(crew.staffId);
  const dayLabel = formatPerthDayNavLabel(selectedDay);
  const longLabel = new Date(selectedDay + 'T12:00:00+08:00').toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const calendarVisits = dayVisits.map((visit) => ({
    appointmentId: visit.appointmentId,
    startsAt: visit.startsAt,
    endsAt: visit.endsAt,
    title: visit.title,
    jobNumber: formatJobNumber(visit.jobNumber),
    customerName: visit.customerName,
    visitStatus: visit.visitStatus,
    fieldStatus: visit.fieldStatus,
    siteAddress: visit.siteAddress,
  }));

  const upcomingCompact = upcoming.slice(0, 4);

  return (
    <main className="ee-tech">
      <TechStyles />
      <header className="ee-tech-head">
        <div className="hq-kicker">TECHNICIAN · TODAY</div>
        <h1>Today</h1>
        <p>
          {longLabel} · {crew.crewName}
        </p>
      </header>
      {params.denied ? (
        <p className="ee-tech-alert ee-tech-alert-error" role="alert">
          That visit is not assigned to you.
        </p>
      ) : null}

      <TechDayCalendar
        dayKey={selectedDay}
        todayKey={todayKey}
        visits={calendarVisits}
        dayLabel={dayLabel}
        prevHref={'/hq/tech?day=' + shiftPerthDayKey(selectedDay, -1)}
        nextHref={'/hq/tech?day=' + shiftPerthDayKey(selectedDay, 1)}
        todayHref="/hq/tech"
      />

      <section className="ee-tech-section" aria-labelledby="tech-upcoming-title">
        <h2 id="tech-upcoming-title">Upcoming</h2>
        {upcomingCompact.length ? (
          upcomingCompact.map((visit) => (
            <article key={visit.appointmentId} className="ee-tech-card ee-tech-card-compact">
              <div className="ee-tech-card-meta">
                <strong>
                  {formatPerthDate(visit.startsAt)} · {formatPerthTime(visit.startsAt)} –{' '}
                  {formatPerthTime(visit.endsAt)}
                </strong>
                <span className="ee-tech-muted">
                  {JOB_STATUS_LABELS[visit.jobStatus as keyof typeof JOB_STATUS_LABELS] ??
                    visit.jobStatus}
                </span>
              </div>
              <h3>
                {formatJobNumber(visit.jobNumber)} · {visit.title}
              </h3>
              <p>{visit.customerName ?? 'Customer not assigned'}</p>
              <div className="ee-tech-actions">
                <Link
                  className="ee-tech-btn ee-tech-btn-primary"
                  href={'/hq/tech/visits/' + visit.appointmentId}
                >
                  Open visit
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
            <p>No scheduled visits in the next two weeks.</p>
          </div>
        )}
      </section>
    </main>
  );
}

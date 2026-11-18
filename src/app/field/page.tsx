import { requireTechnicianCrew } from '@/lib/hq-auth';
import {
  listTechnicianDaySchedule,
  listTechnicianUpcoming,
} from '@/lib/tech-appointments';
import { formatJobNumber, perthDayKey } from '@/lib/perth-day';
import {
  formatPerthDayNavLabel,
  shiftPerthDayKey,
} from '@/lib/day-timeline-layout';
import FieldTodayClient, { type TodayVisitCard } from './field-today-client';
import TechStyles from './tech-styles';
import '@/app/hq/hq.css';

export const dynamic = 'force-dynamic';

function resolveDayParam(raw: string | undefined, todayKey: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return todayKey;
}

function toCard(visit: {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  jobNumber: number;
  customerName: string | null;
  visitStatus: string;
  fieldStatus: string;
  siteAddress: string | null;
}): TodayVisitCard {
  return {
    appointmentId: visit.appointmentId,
    startsAt: visit.startsAt,
    endsAt: visit.endsAt,
    title: visit.title,
    jobNumber: formatJobNumber(visit.jobNumber),
    customerName: visit.customerName,
    visitStatus: visit.visitStatus,
    fieldStatus: visit.fieldStatus,
    siteAddress: visit.siteAddress,
  };
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
  const [dayVisitsRaw, upcomingRaw] = await Promise.all([
    listTechnicianDaySchedule(crew.staffId, selectedDay),
    listTechnicianUpcoming(crew.staffId),
  ]);
  const dayLabel = formatPerthDayNavLabel(selectedDay);
  const longLabel = new Date(selectedDay + 'T12:00:00+08:00').toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const dayVisits = dayVisitsRaw.map(toCard);
  const upcoming = upcomingRaw.map(toCard);

  return (
    <main className="ee-tech">
      <TechStyles />
      <FieldTodayClient
        staffId={crew.staffId}
        crewName={crew.crewName}
        selectedDay={selectedDay}
        todayKey={todayKey}
        dayLabel={dayLabel}
        longLabel={longLabel}
        dayVisits={dayVisits}
        upcoming={upcoming}
        prevHref={'/field?day=' + shiftPerthDayKey(selectedDay, -1)}
        nextHref={'/field?day=' + shiftPerthDayKey(selectedDay, 1)}
        todayHref="/field"
        denied={Boolean(params.denied)}
      />
    </main>
  );
}

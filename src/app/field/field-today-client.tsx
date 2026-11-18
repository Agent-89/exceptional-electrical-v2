'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { loadTodaySnapshot, saveTodaySnapshot } from '@/lib/field-offline/db';
import type { FieldDayVisitSnapshot } from '@/lib/field-offline/types';
import {
  fieldStatusChipModifier,
  fieldVisitStatusLabel,
} from '@/lib/tech-field-constants';
import {
  formatPerthDate,
  formatPerthTime,
  mapsDirectionsUrl,
} from '@/lib/perth-day';
import TechDayCalendar from './tech-day-calendar';

export type TodayVisitCard = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  jobNumber: string;
  customerName: string | null;
  visitStatus: string;
  fieldStatus: string;
  siteAddress: string | null;
};

type Props = {
  staffId: string;
  crewName: string;
  selectedDay: string;
  todayKey: string;
  dayLabel: string;
  longLabel: string;
  dayVisits: TodayVisitCard[];
  upcoming: TodayVisitCard[];
  prevHref: string;
  nextHref: string;
  todayHref: string;
  denied?: boolean;
};

function toSnapshotVisits(visits: TodayVisitCard[]): FieldDayVisitSnapshot[] {
  return visits.map((visit) => ({
    appointmentId: visit.appointmentId,
    startsAt: visit.startsAt,
    endsAt: visit.endsAt,
    title: visit.title,
    jobNumber: visit.jobNumber,
    customerName: visit.customerName ?? '',
    visitStatus: visit.visitStatus,
    fieldStatus: visit.fieldStatus,
    siteAddress: visit.siteAddress ?? '',
  }));
}

function fromSnapshotVisits(visits: FieldDayVisitSnapshot[]): TodayVisitCard[] {
  return visits.map((visit) => ({
    appointmentId: visit.appointmentId,
    startsAt: visit.startsAt,
    endsAt: visit.endsAt,
    title: visit.title,
    jobNumber: visit.jobNumber,
    customerName: visit.customerName || null,
    visitStatus: visit.visitStatus,
    fieldStatus: visit.fieldStatus,
    siteAddress: visit.siteAddress || null,
  }));
}

function VisitActionCard({ visit }: { visit: TodayVisitCard }) {
  const status = fieldVisitStatusLabel(visit.fieldStatus, visit.visitStatus);
  const chipMod = fieldStatusChipModifier(visit.fieldStatus);
  return (
    <article className="ee-tech-card ee-tech-card-compact">
      <div className="ee-tech-card-meta">
        <strong>
          {formatPerthDate(visit.startsAt)} · {formatPerthTime(visit.startsAt)} –{' '}
          {formatPerthTime(visit.endsAt)}
        </strong>
        <span className={`ee-tech-status ${chipMod}`}>{status}</span>
      </div>
      <h3>
        {visit.jobNumber} · {visit.title}
      </h3>
      <p>{visit.customerName ?? 'Customer not assigned'}</p>
      {visit.siteAddress ? <p className="ee-tech-muted">{visit.siteAddress}</p> : null}
      <div className="ee-tech-actions">
        <Link
          className="ee-tech-btn ee-tech-btn-primary"
          href={'/field/visits/' + visit.appointmentId}
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
  );
}

export default function FieldTodayClient({
  staffId,
  crewName,
  selectedDay,
  todayKey,
  dayLabel,
  longLabel,
  dayVisits,
  upcoming,
  prevHref,
  nextHref,
  todayHref,
  denied = false,
}: Props) {
  const [cachedDayVisits, setCachedDayVisits] = useState<TodayVisitCard[] | null>(null);
  const [showingCached, setShowingCached] = useState(false);
  const isToday = selectedDay === todayKey;

  useEffect(() => {
    if (typeof navigator === 'undefined') return;

    if (navigator.onLine) {
      setShowingCached(false);
      setCachedDayVisits(null);
      void saveTodaySnapshot({
        staffId,
        crewName,
        dayKey: selectedDay,
        savedAt: new Date().toISOString(),
        visits: toSnapshotVisits(dayVisits),
      }).catch(() => {
        /* offline cache best-effort */
      });
      return;
    }

    let cancelled = false;
    void loadTodaySnapshot(staffId)
      .then((snap) => {
        if (cancelled || !snap) return;
        if (snap.dayKey !== selectedDay) return;
        setCachedDayVisits(fromSnapshotVisits(snap.visits));
        setShowingCached(true);
      })
      .catch(() => {
        /* keep server HTML if snapshot missing */
      });
    return () => {
      cancelled = true;
    };
  }, [staffId, crewName, selectedDay, dayVisits]);

  useEffect(() => {
    const onOffline = () => {
      void loadTodaySnapshot(staffId)
        .then((snap) => {
          if (!snap || snap.dayKey !== selectedDay) return;
          setCachedDayVisits(fromSnapshotVisits(snap.visits));
          setShowingCached(true);
        })
        .catch(() => {
          /* ignore */
        });
    };
    const onOnline = () => {
      setShowingCached(false);
      setCachedDayVisits(null);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [staffId, selectedDay]);

  const activeDayVisits = cachedDayVisits ?? dayVisits;
  const upcomingCompact = useMemo(() => upcoming.slice(0, 4), [upcoming]);

  return (
    <>
      {showingCached ? (
        <div className="ee-tech-offline-banner" role="status" aria-live="polite">
          Showing cached schedule · reconnect to refresh from HQ.
        </div>
      ) : null}

      <header className="ee-tech-head">
        <div className="hq-kicker">{isToday ? 'TECHNICIAN · TODAY' : 'TECHNICIAN · SCHEDULE'}</div>
        <h1>{isToday ? 'Today' : dayLabel}</h1>
        <p>
          {longLabel} · {crewName}
        </p>
      </header>

      {denied ? (
        <p className="ee-tech-alert ee-tech-alert-error" role="alert">
          That visit is not assigned to you.
        </p>
      ) : null}

      <TechDayCalendar
        dayKey={selectedDay}
        todayKey={todayKey}
        visits={activeDayVisits}
        dayLabel={dayLabel}
        prevHref={prevHref}
        nextHref={nextHref}
        todayHref={todayHref}
      />

      {isToday ? (
        <section className="ee-tech-section" aria-labelledby="tech-today-visits-title">
          <h2 id="tech-today-visits-title">Today&apos;s visits</h2>
          {activeDayVisits.length ? (
            activeDayVisits.map((visit) => <VisitActionCard key={visit.appointmentId} visit={visit} />)
          ) : (
            <div className="ee-tech-empty">
              <strong>No visits today</strong>
              <p>Check nearby days with the arrows, or see later visits below.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="ee-tech-section" aria-labelledby="tech-later-title">
        <h2 id="tech-later-title">Later this week</h2>
        {upcomingCompact.length ? (
          upcomingCompact.map((visit) => <VisitActionCard key={visit.appointmentId} visit={visit} />)
        ) : (
          <div className="ee-tech-empty">
            <strong>Nothing coming up</strong>
            <p>No scheduled visits in the next two weeks.</p>
          </div>
        )}
      </section>
    </>
  );
}

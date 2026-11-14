'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef } from 'react';
import {
  computeVisibleWindow,
  hourLabel,
  layoutOverlappingSlots,
  perthMinutesOnDay,
} from '@/lib/day-timeline-layout';

export type TechCalendarVisit = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  jobNumber: string;
  customerName: string | null;
  visitStatus: string;
  fieldStatus?: string | null;
  siteAddress?: string | null;
};

type Props = {
  dayKey: string;
  todayKey: string;
  visits: TechCalendarVisit[];
  prevHref: string;
  nextHref: string;
  todayHref: string;
  dayLabel: string;
};

const HOUR_HEIGHT = 56;
const MIN_BLOCK = 34;

function statusLabel(visit: TechCalendarVisit): string {
  const field = visit.fieldStatus && visit.fieldStatus !== 'scheduled' ? visit.fieldStatus : null;
  return (field ?? visit.visitStatus).replaceAll('_', ' ');
}

export default function TechDayCalendar({
  dayKey,
  todayKey,
  visits,
  prevHref,
  nextHref,
  todayHref,
  dayLabel,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isToday = dayKey === todayKey;

  const nowMinutes = useMemo(() => {
    if (!isToday) return null;
    return perthMinutesOnDay(new Date().toISOString(), dayKey);
  }, [dayKey, isToday]);

  const positioned = useMemo(() => {
    return visits.map((v) => {
      const startMinutes = perthMinutesOnDay(v.startsAt, dayKey);
      let endMinutes = perthMinutesOnDay(v.endsAt, dayKey);
      if (endMinutes <= startMinutes) endMinutes = Math.min(24 * 60, startMinutes + 30);
      return { ...v, startMinutes, endMinutes };
    });
  }, [visits, dayKey]);

  const window = useMemo(
    () => computeVisibleWindow(positioned, nowMinutes, { padMinutes: 45, minSpanMinutes: 7 * 60 }),
    [positioned, nowMinutes],
  );

  const placements = useMemo(
    () =>
      layoutOverlappingSlots(
        positioned.map((v) => ({
          id: v.appointmentId,
          startMinutes: v.startMinutes,
          endMinutes: v.endMinutes,
        })),
      ),
    [positioned],
  );

  const hours = useMemo(() => {
    const list: number[] = [];
    for (let m = window.startMinutes; m <= window.endMinutes; m += 60) list.push(m / 60);
    return list;
  }, [window]);

  const laneHeight = ((window.endMinutes - window.startMinutes) / 60) * HOUR_HEIGHT;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const focus =
      positioned[0]?.startMinutes ??
      (nowMinutes != null ? nowMinutes : window.startMinutes + 60);
    const top = ((focus - window.startMinutes) / 60) * HOUR_HEIGHT - 48;
    el.scrollTop = Math.max(0, top);
  }, [dayKey, positioned, nowMinutes, window.startMinutes]);

  return (
    <section className="ee-tech-cal" aria-label="Daily schedule">
      <div className="ee-tech-cal-nav">
        <Link className="ee-tech-cal-arrow" href={prevHref} aria-label="Previous day">
          ‹
        </Link>
        <div className="ee-tech-cal-day">
          <strong>{dayLabel}</strong>
          <span>
            {positioned.length} visit{positioned.length === 1 ? '' : 's'}
          </span>
        </div>
        <Link className="ee-tech-cal-arrow" href={nextHref} aria-label="Next day">
          ›
        </Link>
        {!isToday ? (
          <Link className="ee-tech-cal-today" href={todayHref}>
            Today
          </Link>
        ) : (
          <span className="ee-tech-cal-today is-current">Today</span>
        )}
      </div>

      <div className="ee-tech-cal-scroll" ref={scrollRef}>
        <div className="ee-tech-cal-grid" style={{ height: laneHeight + 28 }}>
          <div className="ee-tech-cal-hours" aria-hidden="true">
            {hours.map((h) => (
              <span
                key={h}
                style={{ top: ((h * 60 - window.startMinutes) / 60) * HOUR_HEIGHT }}
              >
                {hourLabel(h)}
              </span>
            ))}
          </div>
          <div
            className="ee-tech-cal-lane"
            style={{
              height: laneHeight,
              backgroundSize: `100% ${HOUR_HEIGHT}px`,
            }}
          >
            {isToday &&
            nowMinutes != null &&
            nowMinutes >= window.startMinutes &&
            nowMinutes <= window.endMinutes ? (
              <div
                className="ee-tech-cal-now"
                style={{ top: ((nowMinutes - window.startMinutes) / 60) * HOUR_HEIGHT }}
              >
                <span>Now</span>
              </div>
            ) : null}

            {positioned.length === 0 ? (
              <div className="ee-tech-cal-empty">
                <strong>No visits this day</strong>
                <p>Use the arrows to check nearby days, or open Upcoming below.</p>
              </div>
            ) : (
              positioned.map((v) => {
                const start = Math.max(window.startMinutes, v.startMinutes);
                const end = Math.min(window.endMinutes, v.endMinutes);
                if (end <= start) return null;
                const { index, count } = placements.get(v.appointmentId) ?? { index: 0, count: 1 };
                const timeLabel =
                  new Date(v.startsAt).toLocaleTimeString('en-AU', {
                    timeZone: 'Australia/Perth',
                    hour: 'numeric',
                    minute: '2-digit',
                  }) +
                  ' – ' +
                  new Date(v.endsAt).toLocaleTimeString('en-AU', {
                    timeZone: 'Australia/Perth',
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                return (
                  <Link
                    key={v.appointmentId}
                    href={'/hq/tech/visits/' + v.appointmentId}
                    className="ee-tech-cal-block"
                    style={{
                      top: ((start - window.startMinutes) / 60) * HOUR_HEIGHT + 2,
                      height: Math.max(MIN_BLOCK, ((end - start) / 60) * HOUR_HEIGHT - 4),
                      left: `calc(${(index / count) * 100}% + 3px)`,
                      width: `calc(${100 / count}% - 6px)`,
                    }}
                  >
                    <strong className="ee-tech-cal-job">
                      {v.jobNumber} · {v.title}
                    </strong>
                    <span className="ee-tech-cal-meta">{timeLabel}</span>
                    <span className="ee-tech-cal-meta">{v.customerName ?? 'Customer not assigned'}</span>
                    <span className="ee-tech-cal-status">{statusLabel(v)}</span>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  computeVisibleWindow,
  hourLabel,
  layoutOverlappingSlots,
  perthMinutesOnDay,
} from '@/lib/day-timeline-layout';
import {
  fieldStatusChipModifier,
  fieldVisitStatusLabel,
} from '@/lib/tech-field-constants';

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
  const fitMode = visits.length > 0 && visits.length <= 2;

  const [nowMinutes, setNowMinutes] = useState<number | null>(() =>
    isToday ? perthMinutesOnDay(new Date().toISOString(), dayKey) : null,
  );

  useEffect(() => {
    if (!isToday) {
      setNowMinutes(null);
      return;
    }
    const tick = () => setNowMinutes(perthMinutesOnDay(new Date().toISOString(), dayKey));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [dayKey, isToday]);

  const positioned = useMemo(() => {
    return visits.map((v) => {
      const startMinutes = perthMinutesOnDay(v.startsAt, dayKey);
      let endMinutes = perthMinutesOnDay(v.endsAt, dayKey);
      if (endMinutes <= startMinutes) endMinutes = Math.min(24 * 60, startMinutes + 30);
      return { ...v, startMinutes, endMinutes };
    });
  }, [visits, dayKey]);

  const visibleWindow = useMemo(
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
    for (let m = visibleWindow.startMinutes; m <= visibleWindow.endMinutes; m += 60) {
      list.push(m / 60);
    }
    return list;
  }, [visibleWindow]);

  const laneHeight =
    ((visibleWindow.endMinutes - visibleWindow.startMinutes) / 60) * HOUR_HEIGHT;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fitMode) return;
    const focus =
      positioned[0]?.startMinutes ??
      (nowMinutes != null ? nowMinutes : visibleWindow.startMinutes + 60);
    const top = ((focus - visibleWindow.startMinutes) / 60) * HOUR_HEIGHT - 48;
    el.scrollTop = Math.max(0, top);
  }, [dayKey, positioned, nowMinutes, visibleWindow.startMinutes, fitMode]);

  return (
    <section className="ee-tech-cal" aria-label="Daily schedule">
      <div className={`ee-tech-cal-nav${isToday ? ' is-today' : ''}`}>
        <Link className="ee-tech-cal-arrow" href={prevHref} aria-label="Previous day">
          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        <div className="ee-tech-cal-day">
          <strong>{dayLabel}</strong>
          <span>
            {positioned.length} visit{positioned.length === 1 ? '' : 's'}
          </span>
        </div>
        <Link className="ee-tech-cal-arrow" href={nextHref} aria-label="Next day">
          <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
        </Link>
        {!isToday ? (
          <Link className="ee-tech-cal-today" href={todayHref}>
            Today
          </Link>
        ) : null}
      </div>

      {positioned.length === 0 ? (
        <div className="ee-tech-empty ee-tech-empty-compact" role="status">
          <strong>No visits {isToday ? 'today' : 'this day'}</strong>
          <p>Check nearby days with the arrows, or see later visits below.</p>
        </div>
      ) : (
        <div
          className={`ee-tech-cal-scroll${fitMode ? ' is-fit' : ''}`}
          ref={scrollRef}
        >
          <div className="ee-tech-cal-grid" style={{ height: laneHeight + 28 }}>
            <div className="ee-tech-cal-hours" aria-hidden="true">
              {hours.map((h) => (
                <span
                  key={h}
                  style={{
                    top: ((h * 60 - visibleWindow.startMinutes) / 60) * HOUR_HEIGHT,
                  }}
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
              nowMinutes >= visibleWindow.startMinutes &&
              nowMinutes <= visibleWindow.endMinutes ? (
                <div
                  className="ee-tech-cal-now"
                  style={{
                    top: ((nowMinutes - visibleWindow.startMinutes) / 60) * HOUR_HEIGHT,
                  }}
                >
                  <span>Now</span>
                </div>
              ) : null}

              {positioned.map((v) => {
                const start = Math.max(visibleWindow.startMinutes, v.startMinutes);
                const end = Math.min(visibleWindow.endMinutes, v.endMinutes);
                if (end <= start) return null;
                const { index, count } = placements.get(v.appointmentId) ?? { index: 0, count: 1 };
                const blockHeight = Math.max(MIN_BLOCK, ((end - start) / 60) * HOUR_HEIGHT - 4);
                const tall = blockHeight >= HOUR_HEIGHT * 2.5;
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
                const status = fieldVisitStatusLabel(v.fieldStatus, v.visitStatus);
                const chipMod = fieldStatusChipModifier(v.fieldStatus);
                return (
                  <Link
                    key={v.appointmentId}
                    href={'/field/visits/' + v.appointmentId}
                    className={`ee-tech-cal-block${tall ? ' is-tall' : ''}`}
                    style={{
                      top: ((start - visibleWindow.startMinutes) / 60) * HOUR_HEIGHT + 2,
                      height: blockHeight,
                      left: `calc(${(index / count) * 100}% + 3px)`,
                      width: `calc(${100 / count}% - 6px)`,
                    }}
                  >
                    <div className="ee-tech-cal-block-head">
                      <strong className="ee-tech-cal-job">
                        {v.jobNumber} · {v.customerName ?? 'Customer not assigned'}
                      </strong>
                      <span className={`ee-tech-cal-status ${chipMod}`}>{status}</span>
                    </div>
                    <span className="ee-tech-cal-meta">{timeLabel}</span>
                    <span className="ee-tech-cal-meta">{v.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

import Link from 'next/link';
import {
  WEEKDAY_LABELS,
  formatWeekCellMinutes,
  formatWeekRangeLabel,
  shiftPerthDayKey,
  type TimesheetStaffWeekRow,
} from '@/lib/timesheet-week';
import { formatDurationMinutes } from '@/lib/tech-time-format';

const AVATAR_COLORS = [
  '#0b6bcb',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#4338ca',
  '#047857',
  '#a16207',
  '#0369a1',
];

function avatarColor(staffId: string): string {
  let hash = 0;
  for (let i = 0; i < staffId.length; i += 1) {
    hash = (hash * 31 + staffId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function buildHref(params: {
  week: string;
  staff?: string;
  job?: string;
  status?: string;
  day?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set('week', params.week);
  if (params.staff) qs.set('staff', params.staff);
  if (params.job) qs.set('job', params.job);
  qs.set('status', params.status ?? 'all');
  if (params.day) qs.set('day', params.day);
  return `/hq/timesheets?${qs.toString()}`;
}

export default function TimesheetWeekGrid({
  mondayKey,
  rows,
  jobFilter,
  statusFilter,
}: {
  mondayKey: string;
  rows: TimesheetStaffWeekRow[];
  jobFilter?: string;
  statusFilter?: string;
}) {
  const prevWeek = shiftPerthDayKey(mondayKey, -7);
  const nextWeek = shiftPerthDayKey(mondayKey, 7);
  const rangeLabel = formatWeekRangeLabel(mondayKey);

  return (
    <section className="hq-panel ee-compact-panel ee-timesheet-week-panel">
      <div className="ee-timesheet-week-head">
        <div>
          <span className="ee-eyebrow">WEEK VIEW</span>
          <h2>{rangeLabel}</h2>
          <p className="ee-muted" style={{ margin: '4px 0 0' }}>
            Approved hours shown. Pending dots mark submitted or corrected entries awaiting accept.
          </p>
        </div>
        <div className="ee-timesheet-week-nav" aria-label="Week navigation">
          <Link
            href={buildHref({
              week: prevWeek,
              job: jobFilter,
              status: statusFilter,
            })}
            className="ee-timesheet-week-nav-btn"
            aria-label="Previous week"
          >
            ‹
          </Link>
          <Link
            href={buildHref({
              week: mondayKey,
              job: jobFilter,
              status: statusFilter,
            })}
            className="ee-timesheet-week-nav-btn"
            aria-label="Current selected week"
          >
            Week
          </Link>
          <Link
            href={buildHref({
              week: nextWeek,
              job: jobFilter,
              status: statusFilter,
            })}
            className="ee-timesheet-week-nav-btn"
            aria-label="Next week"
          >
            ›
          </Link>
        </div>
      </div>

      <div className="ee-job-table-wrap ee-timesheet-week-wrap">
        <table className="ee-job-table ee-timesheet-week-table">
          <thead>
            <tr>
              <th scope="col">Staff</th>
              {WEEKDAY_LABELS.map((label, i) => (
                <th scope="col" key={label}>
                  <span className="ee-timesheet-day-label">{label}</span>
                  <span className="ee-timesheet-day-date">
                    {rows[0]?.days[i]?.dateKey.slice(8) ?? ''}
                  </span>
                </th>
              ))}
              <th scope="col">Week total</th>
              <th scope="col">Billable total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="ee-muted">
                  No active technicians to show.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.staffId}>
                  <th scope="row">
                    <Link
                      href={buildHref({
                        week: mondayKey,
                        staff: row.staffId,
                        job: jobFilter,
                        status: statusFilter ?? 'all',
                      })}
                      className="ee-timesheet-staff"
                    >
                      <span
                        className="ee-timesheet-avatar"
                        style={{ background: avatarColor(row.staffId) }}
                        aria-hidden
                      >
                        {row.initials}
                      </span>
                      <span>{row.fullName}</span>
                    </Link>
                  </th>
                  {row.days.map((day) => {
                    const main = formatWeekCellMinutes(day.approvedWorkedMinutes);
                    const titleParts = [
                      main
                        ? `${formatDurationMinutes(day.approvedWorkedMinutes)} approved`
                        : 'No approved hours',
                    ];
                    if (day.pendingCount) {
                      titleParts.push(
                        `${day.pendingCount} pending ${day.pendingCount === 1 ? 'entry' : 'entries'}`,
                      );
                    }
                    return (
                      <td key={day.dateKey}>
                        <Link
                          href={buildHref({
                            week: mondayKey,
                            staff: row.staffId,
                            job: jobFilter,
                            status: 'all',
                            day: day.dateKey,
                          })}
                          className={
                            'ee-timesheet-day-cell' +
                            (day.pendingCount ? ' has-pending' : '') +
                            (main ? '' : ' is-empty')
                          }
                          title={titleParts.join(' · ')}
                        >
                          <span className="ee-timesheet-day-main">{main || '—'}</span>
                          {day.pendingCount ? (
                            <span className="ee-timesheet-pending-hint" aria-label="Pending review">
                              {day.pendingCount}
                            </span>
                          ) : null}
                        </Link>
                      </td>
                    );
                  })}
                  <td className="ee-timesheet-total">
                    {row.weekApprovedWorkedMinutes
                      ? formatWeekCellMinutes(row.weekApprovedWorkedMinutes)
                      : '—'}
                  </td>
                  <td className="ee-timesheet-total">
                    {row.weekApprovedBillableMinutes
                      ? formatWeekCellMinutes(row.weekApprovedBillableMinutes)
                      : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

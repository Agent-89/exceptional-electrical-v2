'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatJobNumber } from '@/lib/perth-day';
import type { TimesheetEntryStatusFilter } from '@/lib/timesheet-week';

type StaffOption = { id: string; fullName: string };
type JobOption = { id: string; number: number; title: string };

const STATUS_CHIPS: { value: TimesheetEntryStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Needs approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function buildHref(params: {
  week: string;
  staff?: string;
  job?: string;
  status?: TimesheetEntryStatusFilter;
  day?: string;
}): string {
  const qs = new URLSearchParams();
  qs.set('week', params.week);
  if (params.staff) qs.set('staff', params.staff);
  if (params.job) qs.set('job', params.job);
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.day) qs.set('day', params.day);
  return `/hq/timesheets?${qs.toString()}`;
}

export default function TimesheetEntriesFilters({
  mondayKey,
  staffFilter,
  jobFilter,
  statusFilter,
  dayFilter,
  staffOptions,
  jobOptions,
  dayLabel,
  staffLabel,
}: {
  mondayKey: string;
  staffFilter: string;
  jobFilter: string;
  statusFilter: TimesheetEntryStatusFilter;
  dayFilter: string;
  staffOptions: StaffOption[];
  jobOptions: JobOption[];
  dayLabel?: string;
  staffLabel?: string;
}) {
  const router = useRouter();
  const hasFilters = Boolean(staffFilter || jobFilter || dayFilter || statusFilter !== 'all');

  const navigateWith = (patch: {
    staff?: string;
    job?: string;
    status?: TimesheetEntryStatusFilter;
    day?: string | null;
  }) => {
    const nextStaff = patch.staff !== undefined ? patch.staff : staffFilter;
    const nextJob = patch.job !== undefined ? patch.job : jobFilter;
    const nextStatus = patch.status !== undefined ? patch.status : statusFilter;
    const nextDay =
      patch.day === null ? '' : patch.day !== undefined ? patch.day : dayFilter;
    router.push(
      buildHref({
        week: mondayKey,
        staff: nextStaff || undefined,
        job: nextJob || undefined,
        status: nextStatus,
        day: nextDay || undefined,
      }),
    );
  };

  return (
    <div className="ee-timesheet-entries-filters">
      <div className="ee-timesheet-status-chips" role="tablist" aria-label="Entry status">
        {STATUS_CHIPS.map((chip) => {
          const active = statusFilter === chip.value;
          return (
            <Link
              key={chip.value}
              href={buildHref({
                week: mondayKey,
                staff: staffFilter || undefined,
                job: jobFilter || undefined,
                status: chip.value,
                day: dayFilter || undefined,
              })}
              className={'ee-timesheet-status-chip' + (active ? ' is-active' : '')}
              role="tab"
              aria-selected={active}
            >
              {chip.label}
            </Link>
          );
        })}
      </div>

      <div className="ee-timesheet-filter-selects">
        <label className="ee-timesheet-mini-filter">
          <span className="ee-timesheet-mini-label">Tech</span>
          <select
            aria-label="Technician"
            value={staffFilter}
            onChange={(event) => navigateWith({ staff: event.target.value })}
          >
            <option value="">All</option>
            {staffOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="ee-timesheet-mini-filter">
          <span className="ee-timesheet-mini-label">Job</span>
          <select
            aria-label="Job"
            value={jobFilter}
            onChange={(event) => navigateWith({ job: event.target.value })}
          >
            <option value="">All</option>
            {jobOptions.map((j) => (
              <option key={j.id} value={j.id}>
                {formatJobNumber(j.number)} · {j.title}
              </option>
            ))}
          </select>
        </label>
        {hasFilters ? (
          <Link href={buildHref({ week: mondayKey })} className="ee-text-action ee-timesheet-clear">
            Clear
          </Link>
        ) : null}
      </div>

      {dayFilter ? (
        <p className="ee-muted ee-timesheet-day-hint">
          Day filter: {dayLabel || dayFilter}
          {staffLabel ? ` · ${staffLabel}` : ''}.{' '}
          <button type="button" className="ee-text-action" onClick={() => navigateWith({ day: null })}>
            Clear day
          </button>
        </p>
      ) : null}
    </div>
  );
}

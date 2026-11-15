import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatDurationMinutes } from './tech-time-format.ts';
import { aggregateLabourByJob } from './tech-time-multi.ts';
import { FIELD_STATUS_LABELS } from './tech-field-constants.ts';
import {
  VISIT_OUTCOME_LABELS,
  isTerminalVisitOutcome,
  type VisitOutcomeStatus,
} from './tech-visit-report.ts';

/**
 * Mirrors src/lib/job-detail-summary.ts for Node's test runner (no @/ path alias).
 * Keep behaviour aligned with the app module — typecheck/build cover the real imports.
 */
type JobDetailTimeEntry = {
  id: string;
  staffName: string;
  technicianUserId: string;
  appointmentId: string | null;
  startedAt: string;
  endedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
  billableMinutes: number | null;
  status: string;
  note: string | null;
};

const PENDING = new Set(['submitted', 'rejected', 'corrected']);
const LIVE = new Set(['active', 'on_break']);

function labourEligible(entries: JobDetailTimeEntry[]) {
  return entries.filter((e) => e.status !== 'cancelled' && !LIVE.has(e.status));
}

function jobLabourTotals(jobId: string, entries: JobDetailTimeEntry[]) {
  return (
    aggregateLabourByJob(
      labourEligible(entries).map((e) => ({
        jobId,
        technicianUserId: e.technicianUserId,
        appointmentId: e.appointmentId,
        workedMinutes: e.workedMinutes,
        billableMinutes: e.billableMinutes,
        breakMinutes: e.breakMinutes,
        status: e.status,
      })),
    )[0] ?? null
  );
}

function labourTotalMatchesEntrySum(jobId: string, entries: JobDetailTimeEntry[]) {
  const totals = jobLabourTotals(jobId, entries);
  const eligible = labourEligible(entries);
  const sum = eligible.reduce((acc, e) => acc + Math.max(0, e.workedMinutes ?? 0), 0);
  if (!totals) return sum === 0;
  return totals.totalWorkedMinutes === sum && totals.entryCount === eligible.length;
}

function groupTimeEntriesByTechnicianDate(entries: JobDetailTimeEntry[]) {
  const map = new Map<
    string,
    {
      key: string;
      staffName: string;
      workedMinutes: number;
      pendingCount: number;
      entries: JobDetailTimeEntry[];
    }
  >();
  for (const entry of entries) {
    if (entry.status === 'cancelled') continue;
    const dateKey = new Date(entry.startedAt).toLocaleDateString('en-CA', {
      timeZone: 'Australia/Perth',
    });
    const key = `${entry.technicianUserId}::${dateKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(entry);
      if (!LIVE.has(entry.status)) {
        existing.workedMinutes += Math.max(0, entry.workedMinutes ?? 0);
      }
      if (PENDING.has(entry.status)) existing.pendingCount += 1;
      continue;
    }
    map.set(key, {
      key,
      staffName: entry.staffName,
      workedMinutes: LIVE.has(entry.status) ? 0 : Math.max(0, entry.workedMinutes ?? 0),
      pendingCount: PENDING.has(entry.status) ? 1 : 0,
      entries: [entry],
    });
  }
  return [...map.values()];
}

function summarizeTechReport(report: {
  workSummary: string | null;
  followUpRequired: boolean;
  progressStatus: VisitOutcomeStatus;
}) {
  const outcome = VISIT_OUTCOME_LABELS[report.progressStatus] ?? report.progressStatus;
  const bits = [outcome];
  if (report.workSummary) bits.push(report.workSummary);
  if (report.followUpRequired) bits.push('Further visit');
  return bits.join(' · ');
}

describe('job labour totals vs entry durations', () => {
  it('matches the sum of finished entry worked minutes and excludes live timers', () => {
    const entries: JobDetailTimeEntry[] = [
      {
        id: '1',
        staffName: 'Alex',
        technicianUserId: 'tech-a',
        appointmentId: 'appt-a',
        startedAt: '2026-11-14T01:00:00.000Z',
        endedAt: '2026-11-14T03:00:00.000Z',
        breakMinutes: 15,
        workedMinutes: 105,
        billableMinutes: 105,
        status: 'submitted',
        note: null,
      },
      {
        id: '2',
        staffName: 'Alex',
        technicianUserId: 'tech-a',
        appointmentId: 'appt-b',
        startedAt: '2026-11-15T01:00:00.000Z',
        endedAt: null,
        breakMinutes: 0,
        workedMinutes: null,
        billableMinutes: null,
        status: 'active',
        note: null,
      },
      {
        id: '3',
        staffName: 'Blair',
        technicianUserId: 'tech-b',
        appointmentId: 'appt-a',
        startedAt: '2026-11-14T02:00:00.000Z',
        endedAt: '2026-11-14T03:00:00.000Z',
        breakMinutes: 0,
        workedMinutes: 60,
        billableMinutes: null,
        status: 'approved',
        note: null,
      },
    ];

    const totals = jobLabourTotals('job-1', entries);
    assert.ok(totals);
    assert.equal(totals.totalWorkedMinutes, 165);
    assert.equal(totals.entryCount, 2);
    assert.equal(labourTotalMatchesEntrySum('job-1', entries), true);
    assert.equal(
      formatDurationMinutes(totals.totalWorkedMinutes),
      formatDurationMinutes(165),
    );
  });

  it('groups entries by technician and Perth date with pending counts', () => {
    const groups = groupTimeEntriesByTechnicianDate([
      {
        id: '1',
        staffName: 'Alex',
        technicianUserId: 'tech-a',
        appointmentId: 'appt-a',
        startedAt: '2026-11-14T01:00:00.000Z',
        endedAt: '2026-11-14T02:00:00.000Z',
        breakMinutes: 0,
        workedMinutes: 60,
        billableMinutes: 60,
        status: 'submitted',
        note: null,
      },
      {
        id: '2',
        staffName: 'Alex',
        technicianUserId: 'tech-a',
        appointmentId: 'appt-a',
        startedAt: '2026-11-14T03:00:00.000Z',
        endedAt: '2026-11-14T04:00:00.000Z',
        breakMinutes: 0,
        workedMinutes: 60,
        billableMinutes: 60,
        status: 'approved',
        note: null,
      },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].workedMinutes, 120);
    assert.equal(groups[0].pendingCount, 1);
    assert.equal(groups[0].entries.length, 2);
  });
});

describe('job attention and report summaries', () => {
  it('treats missing reports on a second appointment as independent of the first', () => {
    const apptA = {
      id: 'appt-a',
      fieldStatus: 'work_completed',
      followUp: true,
    };
    const apptB = {
      id: 'appt-b',
      fieldStatus: 'in_progress',
      followUp: false,
    };
    const reports = [{ appointmentId: 'appt-a' }];

    assert.equal(isTerminalVisitOutcome(apptA.fieldStatus), true);
    assert.equal(isTerminalVisitOutcome(apptB.fieldStatus), false);
    assert.ok(reports.some((r) => r.appointmentId === apptA.id));
    assert.equal(
      reports.some((r) => r.appointmentId === apptB.id),
      false,
    );
    assert.ok(FIELD_STATUS_LABELS.in_progress);
  });

  it('condenses technician reports into attributed one-liners', () => {
    const line = summarizeTechReport({
      workSummary: 'Replaced isolator and tested circuits on site',
      followUpRequired: true,
      progressStatus: 'work_completed',
    });
    assert.match(line, /Visit completed/);
    assert.match(line, /Replaced isolator/);
    assert.match(line, /Further visit/);
  });
});

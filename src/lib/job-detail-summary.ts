import { formatDurationMinutes } from '@/lib/tech-time-format';
import { aggregateLabourByJob, type LabourRollupEntry } from '@/lib/tech-time-multi';
import { FIELD_STATUS_LABELS, type FieldStatus } from '@/lib/tech-field-constants';
import {
  VISIT_OUTCOME_LABELS,
  isTerminalVisitOutcome,
  type VisitOutcomeStatus,
} from '@/lib/tech-visit-report';
import { isFollowUpOutstanding } from '@/lib/job-follow-up';

export type JobDetailTimeEntry = {
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

export type JobDetailTechReport = {
  id: string;
  appointmentId: string;
  staffId?: string | null;
  technicianName: string | null;
  workSummary: string | null;
  outstandingWork: string | null;
  issues: string | null;
  followUpRequired: boolean;
  progressStatus: VisitOutcomeStatus;
  updatedAt: string;
};

export type JobDetailAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  fieldStatus: string;
  followUp: boolean;
  followUpResolvedAt?: string | null;
  followUpLinkedAppointmentId?: string | null;
  followUpResolution?: 'linked_visit' | 'office_cleared' | null;
  followUpResolutionNote?: string | null;
  completionNote: string | null;
  outstanding: string | null;
  issues: string | null;
  electricianNames?: string[];
  crew?: {id: string; name: string; avatarColor: string | null}[];
  scheduleNotes?: string | null;
};

const PENDING_APPROVAL_STATUSES = new Set(['submitted', 'rejected', 'corrected']);
const LIVE_STATUSES = new Set(['active', 'on_break']);

export function isPendingApprovalStatus(status: string): boolean {
  return PENDING_APPROVAL_STATUSES.has(status);
}

export function isLiveTimeStatus(status: string): boolean {
  return LIVE_STATUSES.has(status);
}

/** Entries included in job labour rollups (excludes live + cancelled). */
export function labourEligibleEntries(entries: JobDetailTimeEntry[]): JobDetailTimeEntry[] {
  return entries.filter(
    (e) => e.status !== 'cancelled' && !isLiveTimeStatus(e.status),
  );
}

export function jobLabourTotals(jobId: string, entries: JobDetailTimeEntry[]) {
  return (
    aggregateLabourByJob(
      labourEligibleEntries(entries).map(
        (e): LabourRollupEntry => ({
          jobId,
          technicianUserId: e.technicianUserId,
          appointmentId: e.appointmentId,
          workedMinutes: e.workedMinutes,
          billableMinutes: e.billableMinutes,
          breakMinutes: e.breakMinutes,
          status: e.status,
        }),
      ),
    )[0] ?? null
  );
}

/**
 * Sum of displayed finished worked minutes must match the labour rollup.
 * Live/cancelled rows are excluded from both sides.
 */
export function labourTotalMatchesEntrySum(
  jobId: string,
  entries: JobDetailTimeEntry[],
): boolean {
  const totals = jobLabourTotals(jobId, entries);
  const eligible = labourEligibleEntries(entries);
  const sum = eligible.reduce((acc, e) => acc + Math.max(0, e.workedMinutes ?? 0), 0);
  if (!totals) return sum === 0;
  return totals.totalWorkedMinutes === sum && totals.entryCount === eligible.length;
}

export type TimeEntryGroup = {
  key: string;
  technicianUserId: string;
  staffName: string;
  dateLabel: string;
  dateKey: string;
  entries: JobDetailTimeEntry[];
  workedMinutes: number;
  pendingCount: number;
};

function perthDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Australia/Perth' });
}

function perthDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    timeZone: 'Australia/Perth',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Group finished + pending entries by technician then Perth calendar day. */
export function groupTimeEntriesByTechnicianDate(
  entries: JobDetailTimeEntry[],
): TimeEntryGroup[] {
  const map = new Map<string, TimeEntryGroup>();
  for (const entry of entries) {
    if (entry.status === 'cancelled') continue;
    const dateKey = perthDateKey(entry.startedAt);
    const key = `${entry.technicianUserId}::${dateKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.entries.push(entry);
      if (!isLiveTimeStatus(entry.status)) {
        existing.workedMinutes += Math.max(0, entry.workedMinutes ?? 0);
      }
      if (isPendingApprovalStatus(entry.status)) existing.pendingCount += 1;
      continue;
    }
    map.set(key, {
      key,
      technicianUserId: entry.technicianUserId,
      staffName: entry.staffName,
      dateLabel: perthDateLabel(entry.startedAt),
      dateKey,
      entries: [entry],
      workedMinutes: isLiveTimeStatus(entry.status)
        ? 0
        : Math.max(0, entry.workedMinutes ?? 0),
      pendingCount: isPendingApprovalStatus(entry.status) ? 1 : 0,
    });
  }
  return [...map.values()].sort((a, b) => {
    if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
    return a.staffName.localeCompare(b.staffName);
  });
}

export type AttentionItem = {
  id: string;
  kind: 'approval' | 'visit_outcome' | 'follow_up' | 'report';
  label: string;
  detail: string;
};

export function buildJobAttentionItems(input: {
  appointments: JobDetailAppointment[];
  techReports: JobDetailTechReport[];
  timeEntries: JobDetailTimeEntry[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  const pending = input.timeEntries.filter((e) => isPendingApprovalStatus(e.status));
  if (pending.length) {
    const minutes = pending.reduce((acc, e) => acc + Math.max(0, e.workedMinutes ?? 0), 0);
    items.push({
      id: 'pending-approvals',
      kind: 'approval',
      label: `${pending.length} time ${pending.length === 1 ? 'entry' : 'entries'} awaiting approval`,
      detail: `${formatDurationMinutes(minutes)} worked · review on the Time tab`,
    });
  }

  for (const a of input.appointments) {
    if (isFollowUpOutstanding(a)) {
      items.push({
        id: `follow-up-${a.id}`,
        kind: 'follow_up',
        label: 'Further visit flagged',
        detail: `${perthDateLabel(a.startsAt)} · shared outcome ${FIELD_STATUS_LABELS[a.fieldStatus as FieldStatus] ?? a.fieldStatus} · resolve on Visits`,
      });
    }
    if (!isTerminalVisitOutcome(a.fieldStatus) && a.fieldStatus !== 'scheduled') {
      const reports = input.techReports.filter((r) => r.appointmentId === a.id);
      if (reports.length) {
        items.push({
          id: `outcome-${a.id}`,
          kind: 'visit_outcome',
          label: 'Waiting on technician reports to close visit',
          detail: `${perthDateLabel(a.startsAt)} · ${reports.length} report${reports.length === 1 ? '' : 's'} on file · visit closes when every assigned electrician submits a final report`,
        });
      }
    }
  }

  const visitsMissingReports = input.appointments.filter((a) => {
    if (a.status === 'cancelled') return false;
    const ended = new Date(a.endsAt).getTime() < Date.now();
    if (!ended && a.fieldStatus === 'scheduled') return false;
    return !input.techReports.some((r) => r.appointmentId === a.id);
  });
  for (const a of visitsMissingReports.slice(0, 3)) {
    items.push({
      id: `report-${a.id}`,
      kind: 'report',
      label: 'No technician work report yet',
      detail: `${perthDateLabel(a.startsAt)} · ${FIELD_STATUS_LABELS[a.fieldStatus as FieldStatus] ?? a.fieldStatus}`,
    });
  }

  return items;
}

export function summarizeTechReport(report: JobDetailTechReport): string {
  const outcome = VISIT_OUTCOME_LABELS[report.progressStatus] ?? report.progressStatus;
  const bits = [outcome];
  if (report.workSummary) {
    const trimmed =
      report.workSummary.length > 90
        ? `${report.workSummary.slice(0, 87).trimEnd()}…`
        : report.workSummary;
    bits.push(trimmed);
  }
  if (report.followUpRequired) bits.push('Further visit');
  return bits.join(' · ');
}

export function visitReportStatusCounts(input: {
  appointments: JobDetailAppointment[];
  techReports: JobDetailTechReport[];
}): {
  visitCount: number;
  summaryCount: number;
  completedCount: number;
  pendingOutcomeCount: number;
  /** @deprecated use summaryCount */
  reportCount: number;
  /** @deprecated use completedCount */
  finalisedCount: number;
} {
  const visitCount = input.appointments.length;
  const summaryCount = input.techReports.filter((r) => Boolean(r.workSummary?.trim())).length;
  const completedCount = input.appointments.filter((a) =>
    isTerminalVisitOutcome(a.fieldStatus),
  ).length;
  const pendingOutcomeCount = input.appointments.filter(
    (a) => !isTerminalVisitOutcome(a.fieldStatus) && a.fieldStatus !== 'scheduled',
  ).length;
  return {
    visitCount,
    summaryCount,
    completedCount,
    pendingOutcomeCount,
    reportCount: summaryCount,
    finalisedCount: completedCount,
  };
}

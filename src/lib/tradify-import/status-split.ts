/** Pure helpers for In Progress / appointment dry-run inventories. */

import {
  groupScheduleWindowsByVisit,
  mapTradifyJobStatus,
  normalizeJobNumber,
  normalizeName,
  parseScheduleWindows,
  scheduleHasFutureWindow,
} from './normalize.ts';
import type {StagedRow} from './dry-run.ts';

export type AppointmentCandidate = {
  jobNumber: string;
  /** Comma-joined crew for reporting; overlap uses staffNames. */
  staffName: string;
  staffNames: string[];
  startAtIso: string;
  endAtIso: string;
  isFuture: boolean;
};

export type InProgressSplit = {
  toInProgress: number;
  toOnHold: number;
  examplesInProgress: {jobNumber: string; customer: string}[];
  examplesOnHold: {jobNumber: string; customer: string}[];
};

export function buildInProgressSplit(
  jobs: StagedRow[],
  now: Date = new Date(),
): InProgressSplit {
  const examplesInProgress: InProgressSplit['examplesInProgress'] = [];
  const examplesOnHold: InProgressSplit['examplesOnHold'] = [];
  let toInProgress = 0;
  let toOnHold = 0;

  for (const row of jobs) {
    const status = (row.payload['Status'] || '').trim();
    if (!/^in progress$/i.test(status)) continue;
    const jobNumber = normalizeJobNumber(row.payload['Job Number'] || '') || '(invalid)';
    const customer = (row.payload['Customer'] || '').trim();
    const future = scheduleHasFutureWindow(row.payload['Schedule'] || '', now);
    const mapped = mapTradifyJobStatus(status, future);
    if (mapped === 'in_progress') {
      toInProgress += 1;
      if (examplesInProgress.length < 20) {
        examplesInProgress.push({jobNumber, customer});
      }
    } else {
      toOnHold += 1;
      if (examplesOnHold.length < 20) {
        examplesOnHold.push({jobNumber, customer});
      }
    }
  }

  return {toInProgress, toOnHold, examplesInProgress, examplesOnHold};
}

export function collectAppointmentCandidates(
  jobs: StagedRow[],
  now: Date = new Date(),
): {
  candidates: AppointmentCandidate[];
  /** Raw Tradify Schedule lines (per electrician). */
  scheduleLines: number;
  /** HQ visits after grouping same job+start+end. */
  visits: number;
  parseFailures: number;
  jobsWithSchedule: number;
  futureCount: number;
  pastCount: number;
  multiCrewVisits: number;
} {
  const candidates: AppointmentCandidate[] = [];
  let parseFailures = 0;
  let jobsWithSchedule = 0;
  let futureCount = 0;
  let pastCount = 0;
  let scheduleLines = 0;
  let multiCrewVisits = 0;

  for (const row of jobs) {
    const raw = row.payload['Schedule'] || '';
    if (!raw.trim()) continue;
    jobsWithSchedule += 1;
    const jobNumber = normalizeJobNumber(row.payload['Job Number'] || '');
    if (!jobNumber) continue;
    const windows = parseScheduleWindows(raw, now);
    if (windows.length === 0) {
      parseFailures += 1;
      continue;
    }
    scheduleLines += windows.length;
    const visits = groupScheduleWindowsByVisit(windows);
    for (const v of visits) {
      const isFuture = v.endAt.getTime() > now.getTime();
      if (isFuture) futureCount += 1;
      else pastCount += 1;
      if (v.staffNames.length > 1) multiCrewVisits += 1;
      candidates.push({
        jobNumber,
        staffName: v.staffNames.join(', '),
        staffNames: v.staffNames,
        startAtIso: v.startAt.toISOString(),
        endAtIso: v.endAt.toISOString(),
        isFuture,
      });
    }
  }

  return {
    candidates,
    scheduleLines,
    visits: candidates.length,
    parseFailures,
    jobsWithSchedule,
    futureCount,
    pastCount,
    multiCrewVisits,
  };
}

/**
 * Soft overlap inventory after visit grouping: same staff on overlapping visits
 * (same-job same-window multi-crew pairs are not counted as overlaps).
 */
export function countStaffOverlaps(candidates: AppointmentCandidate[]): number {
  type Flat = {
    staffKey: string;
    staffName: string;
    jobNumber: string;
    startAtIso: string;
    endAtIso: string;
  };
  const flat: Flat[] = [];
  for (const c of candidates) {
    for (const name of c.staffNames.length ? c.staffNames : [c.staffName]) {
      flat.push({
        staffKey: normalizeName(name),
        staffName: name,
        jobNumber: c.jobNumber,
        startAtIso: c.startAtIso,
        endAtIso: c.endAtIso,
      });
    }
  }

  const byStaff = new Map<string, Flat[]>();
  for (const row of flat) {
    if (!row.staffKey) continue;
    const list = byStaff.get(row.staffKey) || [];
    list.push(row);
    byStaff.set(row.staffKey, list);
  }

  let overlaps = 0;
  for (const list of byStaff.values()) {
    const sorted = list.slice().sort((a, b) => a.startAtIso.localeCompare(b.startAtIso));
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i]!;
      const aEnd = Date.parse(a.endAtIso);
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = sorted[j]!;
        const bStart = Date.parse(b.startAtIso);
        if (bStart >= aEnd) break;
        // Same job + identical window is one visit with multiple crew — not an overlap.
        if (
          a.jobNumber === b.jobNumber &&
          a.startAtIso === b.startAtIso &&
          a.endAtIso === b.endAtIso
        ) {
          continue;
        }
        overlaps += 1;
      }
    }
  }
  return overlaps;
}

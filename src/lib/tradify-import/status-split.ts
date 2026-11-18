/** Pure helpers for In Progress / appointment dry-run inventories. */

import {
  mapTradifyJobStatus,
  normalizeJobNumber,
  parseScheduleWindows,
  scheduleHasFutureWindow,
} from './normalize.ts';
import type {StagedRow} from './dry-run.ts';

export type AppointmentCandidate = {
  jobNumber: string;
  staffName: string;
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
  parseFailures: number;
  jobsWithSchedule: number;
  futureCount: number;
  pastCount: number;
} {
  const candidates: AppointmentCandidate[] = [];
  let parseFailures = 0;
  let jobsWithSchedule = 0;
  let futureCount = 0;
  let pastCount = 0;

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
    for (const w of windows) {
      const isFuture = w.endAt.getTime() > now.getTime();
      if (isFuture) futureCount += 1;
      else pastCount += 1;
      candidates.push({
        jobNumber,
        staffName: w.staffName,
        startAtIso: w.startAt.toISOString(),
        endAtIso: w.endAt.toISOString(),
        isFuture,
      });
    }
  }

  return {candidates, parseFailures, jobsWithSchedule, futureCount, pastCount};
}

/** Soft overlap inventory: same staff, overlapping intervals (import still inserts). */
export function countStaffOverlaps(candidates: AppointmentCandidate[]): number {
  const byStaff = new Map<string, AppointmentCandidate[]>();
  for (const c of candidates) {
    const key = c.staffName.toLowerCase();
    const list = byStaff.get(key) || [];
    list.push(c);
    byStaff.set(key, list);
  }
  let overlaps = 0;
  for (const list of byStaff.values()) {
    const sorted = list
      .slice()
      .sort((a, b) => a.startAtIso.localeCompare(b.startAtIso));
    for (let i = 0; i < sorted.length; i += 1) {
      const a = sorted[i]!;
      const aEnd = Date.parse(a.endAtIso);
      for (let j = i + 1; j < sorted.length; j += 1) {
        const b = sorted[j]!;
        const bStart = Date.parse(b.startAtIso);
        if (bStart >= aEnd) break;
        overlaps += 1;
      }
    }
  }
  return overlaps;
}

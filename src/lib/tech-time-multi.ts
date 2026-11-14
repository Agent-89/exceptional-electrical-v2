/**
 * Pure helpers for multi-technician time tracking.
 * Enforces per-technician timer uniqueness while allowing concurrent
 * active sessions from different technicians on the same appointment.
 */

export type LiveTimerStatus = 'active' | 'on_break';

export type TimerSession = {
  id: string;
  jobId: string;
  appointmentId: string;
  technicianUserId: string;
  staffId: string;
  status: LiveTimerStatus | 'submitted';
  startedAt: string;
  endedAt: string | null;
  breakStartedAt: string | null;
  breakMinutes: number;
  workedMinutes: number | null;
};

export type LabourRollupEntry = {
  jobId: string;
  technicianUserId: string;
  appointmentId: string | null;
  workedMinutes: number | null;
  billableMinutes: number | null;
  breakMinutes: number;
  status: string;
};

export type JobLabourTotals = {
  jobId: string;
  entryCount: number;
  technicianCount: number;
  totalWorkedMinutes: number;
  totalBreakMinutes: number;
  totalBillableMinutes: number;
  billableUnsetCount: number;
};

/** Worked minutes never include break time; billable stays independent. */
export function aggregateLabourByJob(entries: LabourRollupEntry[]): JobLabourTotals[] {
  const byJob = new Map<
    string,
    {
      techs: Set<string>;
      entryCount: number;
      totalWorkedMinutes: number;
      totalBreakMinutes: number;
      totalBillableMinutes: number;
      billableUnsetCount: number;
    }
  >();

  for (const entry of entries) {
    if (entry.status === 'cancelled' || entry.status === 'active' || entry.status === 'on_break') {
      continue;
    }
    const bucket =
      byJob.get(entry.jobId) ??
      {
        techs: new Set<string>(),
        entryCount: 0,
        totalWorkedMinutes: 0,
        totalBreakMinutes: 0,
        totalBillableMinutes: 0,
        billableUnsetCount: 0,
      };
    bucket.techs.add(entry.technicianUserId);
    bucket.entryCount += 1;
    bucket.totalWorkedMinutes += Math.max(0, entry.workedMinutes ?? 0);
    bucket.totalBreakMinutes += Math.max(0, entry.breakMinutes);
    if (entry.billableMinutes == null) bucket.billableUnsetCount += 1;
    else bucket.totalBillableMinutes += Math.max(0, entry.billableMinutes);
    byJob.set(entry.jobId, bucket);
  }

  return [...byJob.entries()]
    .map(([jobId, bucket]) => ({
      jobId,
      entryCount: bucket.entryCount,
      technicianCount: bucket.techs.size,
      totalWorkedMinutes: bucket.totalWorkedMinutes,
      totalBreakMinutes: bucket.totalBreakMinutes,
      totalBillableMinutes: bucket.totalBillableMinutes,
      billableUnsetCount: bucket.billableUnsetCount,
    }))
    .sort((a, b) => a.jobId.localeCompare(b.jobId));
}

/**
 * Shared visit field status derived from live timers.
 * One technician pausing must not mark the visit paused while another is still working.
 */
export function deriveVisitFieldStatusFromLiveTimers(
  live: { technicianUserId: string; status: LiveTimerStatus }[],
): 'in_progress' | 'paused' | null {
  if (!live.length) return null;
  if (live.some((s) => s.status === 'active')) return 'in_progress';
  return 'paused';
}

/** In-memory registry mirroring DB uniqueness rules for concurrent unit tests. */
export class IndependentTechnicianTimerRegistry {
  private sessions = new Map<string, TimerSession>();
  private liveByTechnician = new Map<string, string>();

  list(): TimerSession[] {
    return [...this.sessions.values()];
  }

  liveForAppointment(appointmentId: string): TimerSession[] {
    return this.list().filter(
      (s) =>
        s.appointmentId === appointmentId && (s.status === 'active' || s.status === 'on_break'),
    );
  }

  start(input: {
    id: string;
    jobId: string;
    appointmentId: string;
    technicianUserId: string;
    staffId: string;
    startedAt: string;
  }): TimerSession {
    if (this.liveByTechnician.has(input.technicianUserId)) {
      throw new Error('ACTIVE_SESSION_EXISTS');
    }
    const session: TimerSession = {
      id: input.id,
      jobId: input.jobId,
      appointmentId: input.appointmentId,
      technicianUserId: input.technicianUserId,
      staffId: input.staffId,
      status: 'active',
      startedAt: input.startedAt,
      endedAt: null,
      breakStartedAt: null,
      breakMinutes: 0,
      workedMinutes: null,
    };
    this.sessions.set(session.id, session);
    this.liveByTechnician.set(session.technicianUserId, session.id);
    return { ...session };
  }

  pause(entryId: string, technicianUserId: string, atIso: string): TimerSession {
    const session = this.requireOwnedLive(entryId, technicianUserId);
    if (session.status !== 'active') throw new Error('NOT_ACTIVE');
    session.status = 'on_break';
    session.breakStartedAt = atIso;
    return { ...session };
  }

  resume(entryId: string, technicianUserId: string, atIso: string): TimerSession {
    const session = this.requireOwnedLive(entryId, technicianUserId);
    if (session.status !== 'on_break' || !session.breakStartedAt) throw new Error('NOT_ON_BREAK');
    const breakDelta = Math.max(
      0,
      Math.floor((new Date(atIso).getTime() - new Date(session.breakStartedAt).getTime()) / 60000),
    );
    session.breakMinutes += breakDelta;
    session.breakStartedAt = null;
    session.status = 'active';
    return { ...session };
  }

  finish(
    entryId: string,
    technicianUserId: string,
    atIso: string,
    computeWorked: (startedAt: string, endedAt: string, breakMinutes: number) => number,
  ): TimerSession {
    const session = this.requireOwnedLive(entryId, technicianUserId);
    let breakMinutes = session.breakMinutes;
    if (session.status === 'on_break' && session.breakStartedAt) {
      breakMinutes += Math.max(
        0,
        Math.floor(
          (new Date(atIso).getTime() - new Date(session.breakStartedAt).getTime()) / 60000,
        ),
      );
    }
    session.breakMinutes = breakMinutes;
    session.breakStartedAt = null;
    session.endedAt = atIso;
    session.workedMinutes = computeWorked(session.startedAt, atIso, breakMinutes);
    session.status = 'submitted';
    this.liveByTechnician.delete(technicianUserId);
    return { ...session };
  }

  private requireOwnedLive(entryId: string, technicianUserId: string): TimerSession {
    const session = this.sessions.get(entryId);
    if (!session) throw new Error('NOT_FOUND');
    if (session.technicianUserId !== technicianUserId) throw new Error('NOT_OWNER');
    if (session.status !== 'active' && session.status !== 'on_break') throw new Error('NOT_LIVE');
    return session;
  }
}

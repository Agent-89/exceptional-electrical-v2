import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeWorkedMinutes } from './tech-time-format.ts';
import {
  IndependentTechnicianTimerRegistry,
  aggregateLabourByJob,
  deriveVisitFieldStatusFromLiveTimers,
} from './tech-time-multi.ts';

const JOB = 'job-1';
const APPT = 'appt-shared';
const TECH_A = 'tech-a';
const TECH_B = 'tech-b';

describe('IndependentTechnicianTimerRegistry — multi-tech same visit', () => {
  it('allows two technicians to hold active timers on the same appointment', () => {
    const registry = new IndependentTechnicianTimerRegistry();
    const a = registry.start({
      id: 'e1',
      jobId: JOB,
      appointmentId: APPT,
      technicianUserId: TECH_A,
      staffId: 'staff-a',
      startedAt: '2026-11-14T01:00:00.000Z',
    });
    const b = registry.start({
      id: 'e2',
      jobId: JOB,
      appointmentId: APPT,
      technicianUserId: TECH_B,
      staffId: 'staff-b',
      startedAt: '2026-11-14T01:05:00.000Z',
    });

    assert.equal(a.appointmentId, APPT);
    assert.equal(b.appointmentId, APPT);
    assert.equal(a.technicianUserId, TECH_A);
    assert.equal(b.technicianUserId, TECH_B);
    assert.equal(a.jobId, JOB);
    assert.equal(b.jobId, JOB);
    assert.equal(registry.liveForAppointment(APPT).length, 2);
  });

  it('prevents one technician from holding two concurrent sessions across jobs', () => {
    const registry = new IndependentTechnicianTimerRegistry();
    registry.start({
      id: 'e1',
      jobId: JOB,
      appointmentId: APPT,
      technicianUserId: TECH_A,
      staffId: 'staff-a',
      startedAt: '2026-11-14T01:00:00.000Z',
    });
    assert.throws(
      () =>
        registry.start({
          id: 'e2',
          jobId: 'job-2',
          appointmentId: 'appt-2',
          technicianUserId: TECH_A,
          staffId: 'staff-a',
          startedAt: '2026-11-14T01:10:00.000Z',
        }),
      /ACTIVE_SESSION_EXISTS/,
    );
  });

  it('keeps Technician A pause/resume/finish isolated from Technician B', () => {
    const registry = new IndependentTechnicianTimerRegistry();
    const a = registry.start({
      id: 'e1',
      jobId: JOB,
      appointmentId: APPT,
      technicianUserId: TECH_A,
      staffId: 'staff-a',
      startedAt: '2026-11-14T01:00:00.000Z',
    });
    const b = registry.start({
      id: 'e2',
      jobId: JOB,
      appointmentId: APPT,
      technicianUserId: TECH_B,
      staffId: 'staff-b',
      startedAt: '2026-11-14T01:00:00.000Z',
    });

    registry.pause(a.id, TECH_A, '2026-11-14T01:30:00.000Z');
    const stillB = registry.list().find((s) => s.id === b.id)!;
    assert.equal(stillB.status, 'active');
    assert.equal(stillB.breakMinutes, 0);

    registry.resume(a.id, TECH_A, '2026-11-14T01:45:00.000Z');
    const finishedA = registry.finish(
      a.id,
      TECH_A,
      '2026-11-14T03:00:00.000Z',
      computeWorkedMinutes,
    );
    // 120 elapsed - 15 break = 105
    assert.equal(finishedA.workedMinutes, 105);
    assert.equal(finishedA.status, 'submitted');

    const bAfter = registry.list().find((s) => s.id === b.id)!;
    assert.equal(bAfter.status, 'active');
    assert.equal(bAfter.endedAt, null);
    assert.equal(bAfter.workedMinutes, null);

    assert.throws(() => registry.pause(b.id, TECH_A, '2026-11-14T03:05:00.000Z'), /NOT_OWNER/);
  });

  it('supports concurrent start then independent finish for two technicians', () => {
    const registry = new IndependentTechnicianTimerRegistry();
    const starts = [
      registry.start({
        id: 'e1',
        jobId: JOB,
        appointmentId: APPT,
        technicianUserId: TECH_A,
        staffId: 'staff-a',
        startedAt: '2026-11-14T02:00:00.000Z',
      }),
      registry.start({
        id: 'e2',
        jobId: JOB,
        appointmentId: APPT,
        technicianUserId: TECH_B,
        staffId: 'staff-b',
        startedAt: '2026-11-14T02:00:00.000Z',
      }),
    ];
    assert.equal(starts.length, 2);

    const finished = [
      registry.finish(starts[0].id, TECH_A, '2026-11-14T04:00:00.000Z', computeWorkedMinutes),
      registry.finish(starts[1].id, TECH_B, '2026-11-14T03:30:00.000Z', computeWorkedMinutes),
    ];
    assert.equal(finished[0].workedMinutes, 120);
    assert.equal(finished[1].workedMinutes, 90);
    assert.equal(registry.liveForAppointment(APPT).length, 0);

    const totals = aggregateLabourByJob(
      finished.map((s) => ({
        jobId: s.jobId,
        technicianUserId: s.technicianUserId,
        appointmentId: s.appointmentId,
        workedMinutes: s.workedMinutes,
        billableMinutes: null,
        breakMinutes: s.breakMinutes,
        status: s.status,
      })),
    );
    assert.equal(totals.length, 1);
    assert.equal(totals[0].technicianCount, 2);
    assert.equal(totals[0].totalWorkedMinutes, 210);
    assert.equal(totals[0].totalBillableMinutes, 0);
    assert.equal(totals[0].billableUnsetCount, 2);
  });
});

describe('deriveVisitFieldStatusFromLiveTimers', () => {
  it('stays in progress when another technician is still active after one pauses', () => {
    assert.equal(
      deriveVisitFieldStatusFromLiveTimers([
        { technicianUserId: TECH_A, status: 'on_break' },
        { technicianUserId: TECH_B, status: 'active' },
      ]),
      'in_progress',
    );
  });

  it('is paused only when every live timer is on break', () => {
    assert.equal(
      deriveVisitFieldStatusFromLiveTimers([
        { technicianUserId: TECH_A, status: 'on_break' },
        { technicianUserId: TECH_B, status: 'on_break' },
      ]),
      'paused',
    );
  });

  it('does not invent a completed visit outcome when timers finish', () => {
    assert.equal(deriveVisitFieldStatusFromLiveTimers([]), null);
  });
});

describe('aggregateLabourByJob', () => {
  it('sums individual technician entries and keeps billable separate from worked', () => {
    const totals = aggregateLabourByJob([
      {
        jobId: JOB,
        technicianUserId: TECH_A,
        appointmentId: APPT,
        workedMinutes: 100,
        billableMinutes: 80,
        breakMinutes: 20,
        status: 'submitted',
      },
      {
        jobId: JOB,
        technicianUserId: TECH_B,
        appointmentId: APPT,
        workedMinutes: 60,
        billableMinutes: null,
        breakMinutes: 10,
        status: 'approved',
      },
      {
        jobId: JOB,
        technicianUserId: TECH_A,
        appointmentId: APPT,
        workedMinutes: 30,
        billableMinutes: 0,
        breakMinutes: 0,
        status: 'active',
      },
    ]);
    assert.equal(totals[0].entryCount, 2);
    assert.equal(totals[0].technicianCount, 2);
    assert.equal(totals[0].totalWorkedMinutes, 160);
    assert.equal(totals[0].totalBreakMinutes, 30);
    assert.equal(totals[0].totalBillableMinutes, 80);
    assert.equal(totals[0].billableUnsetCount, 1);
  });
});

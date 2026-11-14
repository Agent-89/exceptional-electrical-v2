import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVisitReportPatch,
  canTechnicianFinaliseSharedVisit,
  defaultVisitOutcomeForForm,
  resolveTechnicianVisitOutcome,
  timerFinishCompletesVisit,
  visitOutcomeUpdatesJobStatus,
} from './tech-visit-report.ts';

describe('visit report outcomes', () => {
  it('maps form defaults from timer-derived statuses without inventing new values', () => {
    assert.equal(defaultVisitOutcomeForForm('scheduled'), 'in_progress');
    assert.equal(defaultVisitOutcomeForForm('paused'), 'in_progress');
    assert.equal(defaultVisitOutcomeForForm('in_progress'), 'in_progress');
    assert.equal(defaultVisitOutcomeForForm('work_completed'), 'work_completed');
    assert.equal(defaultVisitOutcomeForForm('unable_to_complete'), 'unable_to_complete');
  });

  it('allows in-progress reports to be saved with partial fields', () => {
    const patch = buildVisitReportPatch({
      fieldStatus: 'in_progress',
      fields: {
        completionNote: 'Pulled cable',
        outstandingWork: null,
        issues: null,
        furtherVisitRequired: false,
      },
      currentAppointmentStatus: 'scheduled',
      completedAtIso: '2026-11-14T08:00:00.000Z',
    });
    assert.equal(patch.fieldStatus, 'in_progress');
    assert.equal(patch.completionNote, 'Pulled cable');
    assert.equal(patch.outstandingWork, null);
    assert.equal(patch.fieldCompletedAt, undefined);
    assert.equal(patch.appointmentStatusCompleted, false);
  });

  it('completing a visit never updates jobs.status', () => {
    assert.equal(visitOutcomeUpdatesJobStatus(), false);
    const patch = buildVisitReportPatch({
      fieldStatus: 'work_completed',
      fields: {
        completionNote: 'Done',
        outstandingWork: null,
        issues: null,
        furtherVisitRequired: true,
      },
      currentAppointmentStatus: 'scheduled',
      completedAtIso: '2026-11-14T08:00:00.000Z',
    });
    assert.equal(patch.appointmentStatusCompleted, true);
    assert.equal(patch.fieldCompletedAt, '2026-11-14T08:00:00.000Z');
    assert.equal(patch.furtherVisitRequired, true);
    assert.equal(visitOutcomeUpdatesJobStatus(), false);
  });

  it('finishing a timer does not complete a visit', () => {
    assert.equal(timerFinishCompletesVisit(), false);
  });
});

describe('multi-technician shared visit finalisation', () => {
  it('lets a solo technician finalise the shared visit outcome', () => {
    assert.equal(canTechnicianFinaliseSharedVisit(1), true);
    assert.equal(canTechnicianFinaliseSharedVisit(0), true);
    const resolved = resolveTechnicianVisitOutcome({
      requested: 'work_completed',
      assignedTechnicianCount: 1,
    });
    assert.equal(resolved.ok, true);
    if (resolved.ok) assert.equal(resolved.fieldStatus, 'work_completed');
  });

  it('blocks one technician from accidentally finalising a shared multi-tech visit', () => {
    assert.equal(canTechnicianFinaliseSharedVisit(2), false);
    const completed = resolveTechnicianVisitOutcome({
      requested: 'work_completed',
      assignedTechnicianCount: 2,
    });
    assert.equal(completed.ok, false);
    if (!completed.ok) assert.match(completed.error, /office will close/i);

    const unable = resolveTechnicianVisitOutcome({
      requested: 'unable_to_complete',
      assignedTechnicianCount: 3,
    });
    assert.equal(unable.ok, false);

    const progress = resolveTechnicianVisitOutcome({
      requested: 'in_progress',
      assignedTechnicianCount: 2,
    });
    assert.equal(progress.ok, true);
    if (progress.ok) assert.equal(progress.fieldStatus, 'in_progress');
  });

  it('rejects unsupported status values instead of inventing schema values', () => {
    const bad = resolveTechnicianVisitOutcome({
      requested: 'visit_completed',
      assignedTechnicianCount: 1,
    });
    assert.equal(bad.ok, false);
  });
});

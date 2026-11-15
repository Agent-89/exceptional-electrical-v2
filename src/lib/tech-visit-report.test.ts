import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TECH_WORK_REPORT_CONFLICT_MESSAGE,
  VISIT_REPORT_CONFLICT_MESSAGE,
  buildVisitReportPatch,
  canTechnicianFinaliseSharedVisit,
  canTechnicianWriteSharedVisitFields,
  defaultVisitOutcomeForForm,
  resolveTechnicianVisitOutcome,
  seedTechWorkReportFromShared,
  techWorkReportSaveIsNoop,
  techWorkReportSnapshotsMatch,
  timerFinishCompletesVisit,
  visitOutcomeUpdatesJobStatus,
  visitReportSaveIsNoop,
  visitReportSnapshotsMatch,
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
    if (!completed.ok) assert.match(completed.error, /office will close|own work report/i);

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

describe('shared visit report concurrency', () => {
  it('detects when another technician changed the shared report since the form loaded', () => {
    const expected = {
      fieldStatus: 'in_progress',
      completionNote: 'Tech A pulled cable',
      outstandingWork: null,
      issues: null,
      furtherVisitRequired: false,
    };
    assert.equal(visitReportSnapshotsMatch(expected, expected), true);
    assert.equal(
      visitReportSnapshotsMatch(expected, {
        ...expected,
        completionNote: 'Tech B finished switchboard',
      }),
      false,
    );
    assert.match(VISIT_REPORT_CONFLICT_MESSAGE, /updated by someone else/i);
  });

  it('treats blank and null report text as equivalent snapshots', () => {
    assert.equal(
      visitReportSnapshotsMatch(
        {
          fieldStatus: 'in_progress',
          completionNote: '',
          outstandingWork: null,
          issues: '  ',
          furtherVisitRequired: false,
        },
        {
          fieldStatus: 'in_progress',
          completionNote: null,
          outstandingWork: null,
          issues: null,
          furtherVisitRequired: false,
        },
      ),
      true,
    );
  });

  it('treats identical proposed saves as no-ops so activity is not duplicated', () => {
    const current = {
      fieldStatus: 'in_progress',
      completionNote: 'Pulled cable',
      outstandingWork: null,
      issues: null,
      furtherVisitRequired: false,
    };
    assert.equal(visitReportSaveIsNoop(current, { ...current }), true);
    assert.equal(
      visitReportSaveIsNoop(current, { ...current, completionNote: 'Pulled cable ' }),
      true,
    );
    assert.equal(
      visitReportSaveIsNoop(current, { ...current, completionNote: 'Different note' }),
      false,
    );
  });
});

describe('individual technician work reports', () => {
  it('blocks technicians from writing shared fields when the visit is already finalised', () => {
    const blocked = canTechnicianWriteSharedVisitFields({
      assignedTechnicianCount: 1,
      currentSharedFieldStatus: 'work_completed',
      requestedPersonalStatus: 'in_progress',
    });
    assert.equal(blocked.writeShared, false);
    assert.equal(blocked.finaliseShared, false);
  });

  it('lets a solo technician finalise a non-terminal shared visit', () => {
    const solo = canTechnicianWriteSharedVisitFields({
      assignedTechnicianCount: 1,
      currentSharedFieldStatus: 'in_progress',
      requestedPersonalStatus: 'work_completed',
    });
    assert.equal(solo.writeShared, true);
    assert.equal(solo.finaliseShared, true);
  });

  it('keeps multi-tech saves on personal reports only', () => {
    const multi = canTechnicianWriteSharedVisitFields({
      assignedTechnicianCount: 2,
      currentSharedFieldStatus: 'in_progress',
      requestedPersonalStatus: 'work_completed',
    });
    assert.equal(multi.writeShared, false);
    assert.equal(multi.finaliseShared, false);
  });

  it('detects concurrent personal report edits via updatedAt', () => {
    const base = {
      workSummary: 'Pulled cable',
      outstandingWork: null,
      issues: null,
      followUpRequired: false,
      progressStatus: 'in_progress' as const,
      updatedAt: '2026-11-15T01:00:00.000Z',
    };
    assert.equal(techWorkReportSnapshotsMatch(base, base), true);
    assert.equal(
      techWorkReportSnapshotsMatch(base, {
        ...base,
        updatedAt: '2026-11-15T01:05:00.000Z',
      }),
      false,
    );
    assert.equal(techWorkReportSaveIsNoop(base, { ...base, workSummary: 'Pulled cable ' }), true);
    assert.equal(
      techWorkReportSaveIsNoop(base, { ...base, workSummary: 'Different' }),
      false,
    );
    assert.match(TECH_WORK_REPORT_CONFLICT_MESSAGE, /refresh/i);
  });

  it('seeds an empty personal form from legacy shared field text without inventing values', () => {
    const seeded = seedTechWorkReportFromShared({
      completionNote: ' Legacy summary ',
      outstandingWork: null,
      issues: '',
      followUpRequired: true,
      fieldStatus: 'paused',
    });
    assert.equal(seeded.workSummary, 'Legacy summary');
    assert.equal(seeded.outstandingWork, null);
    assert.equal(seeded.issues, null);
    assert.equal(seeded.followUpRequired, true);
    assert.equal(seeded.progressStatus, 'in_progress');
  });
});

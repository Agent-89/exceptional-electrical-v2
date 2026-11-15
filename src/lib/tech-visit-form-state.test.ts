import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildVisitReportFormStateForAppointment,
  expectedTechUpdatedAtForAppointment,
  shouldResetVisitReportForm,
  techWorkReportIdentityKey,
} from './tech-visit-form-state.ts';

const APPT_A = '11111111-1111-4111-8111-111111111111';
const APPT_B = '22222222-2222-4222-8222-222222222222';
const TECH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('tech work report identity across appointments', () => {
  it('scopes one personal report per technician per appointment, not per job', () => {
    const a = techWorkReportIdentityKey(APPT_A, TECH);
    const b = techWorkReportIdentityKey(APPT_B, TECH);
    assert.notEqual(a, b);
    assert.equal(a, `${APPT_A}::${TECH}`);
  });

  it('allows the same technician to hold independent report keys on two visits', () => {
    const keys = new Set([
      techWorkReportIdentityKey(APPT_A, TECH),
      techWorkReportIdentityKey(APPT_B, TECH),
    ]);
    assert.equal(keys.size, 2);
  });
});

describe('visit report form reset when switching appointments', () => {
  it('detects soft-navigation between visits as a required reset', () => {
    assert.equal(shouldResetVisitReportForm(APPT_A, APPT_B), true);
    assert.equal(shouldResetVisitReportForm(APPT_A, APPT_A), false);
    assert.equal(shouldResetVisitReportForm(null, APPT_B), false);
  });

  it('clears Saved flash, busy, dirty, and stale concurrency token for a new visit', () => {
    const next = buildVisitReportFormStateForAppointment({
      appointmentId: APPT_B,
      fieldStatus: 'scheduled',
      completionNote: 'Cable pull day 2',
      outstandingWork: null,
      issues: null,
      followUpRequired: false,
      personalProgressStatus: 'in_progress',
      techReportUpdatedAt: null,
      sharedCompletionNote: 'Shared from visit A leftover seed',
      sharedOutstandingWork: null,
      sharedIssues: null,
      sharedFollowUpRequired: false,
    });

    assert.equal(next.appointmentId, APPT_B);
    assert.equal(next.reportSavedFlash, false);
    assert.equal(next.reportPending, false);
    assert.equal(next.reportDirty, false);
    assert.equal(next.busy, null);
    assert.equal(next.expectedTechUpdatedAt, null);
    assert.equal(next.completion, 'Cable pull day 2');
    assert.equal(next.expectedCompletion, 'Shared from visit A leftover seed');
  });

  it('keeps the personal concurrency token only for the matching appointment', () => {
    const token = '2026-11-15T01:00:00.000Z';
    assert.equal(
      expectedTechUpdatedAtForAppointment({
        appointmentId: APPT_B,
        formAppointmentId: APPT_B,
        techReportUpdatedAt: token,
      }),
      token,
    );
    assert.equal(
      expectedTechUpdatedAtForAppointment({
        appointmentId: APPT_B,
        formAppointmentId: APPT_A,
        techReportUpdatedAt: token,
      }),
      null,
    );
  });

  it('simulates save-on-A then open-B: B must be saveable without A token', () => {
    // After saving A the client would have Saved flash + A's updatedAt.
    const afterSaveA = {
      reportSavedFlash: true,
      expectedTechUpdatedAt: '2026-11-15T01:00:00.000Z',
      appointmentId: APPT_A,
      busy: null as null,
    };

    assert.equal(shouldResetVisitReportForm(afterSaveA.appointmentId, APPT_B), true);

    const forB = buildVisitReportFormStateForAppointment({
      appointmentId: APPT_B,
      fieldStatus: 'scheduled',
      completionNote: null,
      outstandingWork: null,
      issues: null,
      followUpRequired: false,
      personalProgressStatus: 'in_progress',
      techReportUpdatedAt: null,
      sharedCompletionNote: null,
      sharedOutstandingWork: null,
      sharedIssues: null,
      sharedFollowUpRequired: false,
    });

    assert.equal(forB.reportSavedFlash, false);
    assert.equal(forB.expectedTechUpdatedAt, null);
    assert.equal(forB.busy, null);
    // First insert on B must not send a stale token from A.
    assert.equal(
      expectedTechUpdatedAtForAppointment({
        appointmentId: APPT_B,
        formAppointmentId: forB.appointmentId,
        techReportUpdatedAt: forB.expectedTechUpdatedAt,
      }),
      null,
    );
  });
});

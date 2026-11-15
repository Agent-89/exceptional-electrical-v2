import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isMissingTechReportsRelation } from './tech-work-reports-errors.ts';

describe('isMissingTechReportsRelation', () => {
  it('accepts true missing-relation errors only', () => {
    assert.equal(
      isMissingTechReportsRelation({
        code: '42P01',
        message: 'relation "public.job_appointment_tech_reports" does not exist',
      }),
      true,
    );
    assert.equal(
      isMissingTechReportsRelation({
        code: 'PGRST205',
        message: "Could not find the table 'public.job_appointment_tech_reports' in the schema cache",
      }),
      true,
    );
  });

  it('does not soft-hide column or permission failures that mention the table', () => {
    assert.equal(
      isMissingTechReportsRelation({
        code: 'PGRST204',
        message:
          "Could not find the 'progress_status' column of 'job_appointment_tech_reports' in the schema cache",
      }),
      false,
    );
    assert.equal(
      isMissingTechReportsRelation({
        code: '42501',
        message: 'permission denied for table job_appointment_tech_reports',
      }),
      false,
    );
    assert.equal(
      isMissingTechReportsRelation({
        message: 'new row for relation "job_appointment_tech_reports" violates check constraint',
      }),
      false,
    );
  });
});

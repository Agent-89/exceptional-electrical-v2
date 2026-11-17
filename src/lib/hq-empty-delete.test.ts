import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateCustomerEmptyDelete,
  evaluateEnquiryEmptyDelete,
  evaluateJobEmptyDelete,
  evaluateQuoteEmptyDelete,
  evaluateVisitEmptyDelete,
  formatEmptyDeleteBlockers,
} from './hq-empty-delete.ts';

const emptyJob = {
  appointmentCount: 0,
  timeEntryCount: 0,
  jobQuoteCount: 0,
  noteCount: 0,
  attachmentCount: 0,
  meaningfulActivityCount: 0,
};

describe('hq empty delete eligibility', () => {
  it('allows deleting a completely empty job', () => {
    const result = evaluateJobEmptyDelete(emptyJob);
    assert.equal(result.eligible, true);
    assert.deepEqual(result.blockers, []);
  });

  it('blocks job delete when visits or quotes exist', () => {
    const result = evaluateJobEmptyDelete({
      ...emptyJob,
      appointmentCount: 2,
      jobQuoteCount: 1,
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.some((b) => b.includes('2 visits')));
    assert.ok(result.blockers.some((b) => b.includes('1 linked quote')));
  });

  it('allows draft quotes with no links', () => {
    const result = evaluateQuoteEmptyDelete({
      status: 'draft',
      jobQuoteCount: 0,
      childVariationCount: 0,
      isCommercialCurrent: false,
      meaningfulActivityCount: 0,
    });
    assert.equal(result.eligible, true);
  });

  it('blocks non-draft quotes and commercial current', () => {
    const result = evaluateQuoteEmptyDelete({
      status: 'sent',
      jobQuoteCount: 0,
      childVariationCount: 0,
      isCommercialCurrent: true,
      meaningfulActivityCount: 0,
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.some((b) => /draft only/i.test(b)));
    assert.ok(result.blockers.some((b) => /commercial current/i.test(b)));
  });

  it('blocks enquiries linked to customers or quotes', () => {
    const result = evaluateEnquiryEmptyDelete({
      customerId: 'cust-1',
      linkedQuoteCount: 1,
      meaningfulActivityCount: 0,
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.some((b) => /customer/i.test(b)));
    assert.ok(result.blockers.some((b) => /quote/i.test(b)));
  });

  it('allows empty customers with no related records', () => {
    const result = evaluateCustomerEmptyDelete({
      jobCount: 0,
      quoteCount: 0,
      enquiryCount: 0,
      noteCount: 0,
    });
    assert.equal(result.eligible, true);
  });

  it('blocks customers with jobs or notes', () => {
    const result = evaluateCustomerEmptyDelete({
      jobCount: 1,
      quoteCount: 0,
      enquiryCount: 0,
      noteCount: 2,
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.some((b) => /1 job/i.test(b)));
    assert.ok(result.blockers.some((b) => /2 notes/i.test(b)));
  });

  it('allows unused scheduled visits', () => {
    const result = evaluateVisitEmptyDelete({
      timeEntryCount: 0,
      fieldStatus: 'scheduled',
      fieldCompletionNote: null,
      fieldOutstandingWork: null,
      fieldIssues: null,
      fieldFollowUpRequired: false,
      techReportCount: 0,
    });
    assert.equal(result.eligible, true);
  });

  it('blocks visits with field work or reports', () => {
    const result = evaluateVisitEmptyDelete({
      timeEntryCount: 1,
      fieldStatus: 'work_completed',
      fieldCompletionNote: 'Done',
      fieldOutstandingWork: null,
      fieldIssues: null,
      fieldFollowUpRequired: true,
      techReportCount: 1,
    });
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.length >= 3);
  });

  it('formats blockers for UI messages', () => {
    assert.match(formatEmptyDeleteBlockers(['Has 2 visits']), /Cannot delete/);
    assert.match(formatEmptyDeleteBlockers([]), /permanently deleted/);
  });
});

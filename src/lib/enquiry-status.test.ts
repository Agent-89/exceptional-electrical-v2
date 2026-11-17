import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENQUIRY_STATUSES,
  enquiryStatusLabel,
  isEnquiryStatus,
  normalizeEnquiryStatus,
} from './enquiry-status.ts';

describe('enquiry status helpers', () => {
  it('exposes the simplified HQ status set', () => {
    assert.deepEqual([...ENQUIRY_STATUSES], ['new', 'contacted', 'closed', 'spam']);
  });

  it('accepts current statuses and rejects retired ones for writes', () => {
    assert.equal(isEnquiryStatus('new'), true);
    assert.equal(isEnquiryStatus('contacted'), true);
    assert.equal(isEnquiryStatus('qualified'), false);
    assert.equal(isEnquiryStatus('scheduled'), false);
  });

  it('maps legacy statuses to contacted for display', () => {
    assert.equal(normalizeEnquiryStatus('qualified'), 'contacted');
    assert.equal(normalizeEnquiryStatus('scheduled'), 'contacted');
    assert.equal(normalizeEnquiryStatus('CONTACTED'), 'contacted');
    assert.equal(normalizeEnquiryStatus(''), 'new');
  });

  it('labels normalized statuses', () => {
    assert.equal(enquiryStatusLabel('spam'), 'Spam');
    assert.equal(enquiryStatusLabel('qualified'), 'Contacted');
  });
});

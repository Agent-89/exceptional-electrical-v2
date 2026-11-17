import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  enquiryUrgencyLabel,
  isUrgentEnquiryUrgency,
  normalizeEnquiryUrgency,
  resolveEnquiryUrgency,
} from './enquiry-urgency.ts';

describe('normalizeEnquiryUrgency', () => {
  it('maps Vapi and draft aliases onto the DB enum', () => {
    assert.equal(normalizeEnquiryUrgency('urgent'), 'high');
    assert.equal(normalizeEnquiryUrgency('priority'), 'high');
    assert.equal(normalizeEnquiryUrgency('HIGH'), 'high');
    assert.equal(normalizeEnquiryUrgency('routine'), 'normal');
    assert.equal(normalizeEnquiryUrgency('normal'), 'normal');
    assert.equal(normalizeEnquiryUrgency('emergency'), 'emergency');
    assert.equal(normalizeEnquiryUrgency('low'), 'low');
  });

  it('treats empty and unknown tokens as unknown', () => {
    assert.equal(normalizeEnquiryUrgency(null), 'unknown');
    assert.equal(normalizeEnquiryUrgency(''), 'unknown');
    assert.equal(normalizeEnquiryUrgency('unknown'), 'unknown');
    assert.equal(normalizeEnquiryUrgency('unclassified'), 'unknown');
    assert.equal(normalizeEnquiryUrgency('maybe'), 'unknown');
  });
});

describe('resolveEnquiryUrgency', () => {
  it('falls back from column unknown to message metadata', () => {
    assert.equal(resolveEnquiryUrgency('unknown', 'urgent'), 'high');
    assert.equal(resolveEnquiryUrgency(null, 'priority'), 'high');
    assert.equal(resolveEnquiryUrgency('', 'routine'), 'normal');
  });

  it('prefers a real column value over message metadata', () => {
    assert.equal(resolveEnquiryUrgency('emergency', 'normal'), 'emergency');
    assert.equal(resolveEnquiryUrgency('high', 'unknown'), 'high');
    assert.equal(resolveEnquiryUrgency('low', 'urgent'), 'low');
  });
});

describe('isUrgentEnquiryUrgency / enquiryUrgencyLabel', () => {
  it('flags high and emergency as urgent', () => {
    assert.equal(isUrgentEnquiryUrgency('high'), true);
    assert.equal(isUrgentEnquiryUrgency('emergency'), true);
    assert.equal(isUrgentEnquiryUrgency('normal'), false);
    assert.equal(isUrgentEnquiryUrgency('unknown'), false);
  });

  it('labels canonical values for display', () => {
    assert.equal(enquiryUrgencyLabel('high'), 'High');
    assert.equal(enquiryUrgencyLabel('unknown'), 'Unknown');
  });
});

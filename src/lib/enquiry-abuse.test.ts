import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  ENQUIRY_COOLDOWN_MS,
  enquiryCooldownCutoffIso,
  isWithinEnquiryCooldown,
  normalizeEnquiryEmail,
  normalizeEnquiryPhone,
} from './enquiry-abuse.ts';

describe('normalizeEnquiryEmail', () => {
  it('trims and lowercases', () => {
    assert.equal(normalizeEnquiryEmail('  Pat@Example.COM '), 'pat@example.com');
  });
});

describe('normalizeEnquiryPhone', () => {
  it('keeps digits only', () => {
    assert.equal(normalizeEnquiryPhone('+61 412 345 678'), '61412345678');
    assert.equal(normalizeEnquiryPhone('(08) 1234-5678'), '0812345678');
  });
});

describe('enquiry cooldown window', () => {
  it('builds cutoff ISO from now and window', () => {
    const now = Date.parse('2026-11-18T00:15:00.000Z');
    assert.equal(enquiryCooldownCutoffIso(now, 15 * 60 * 1000), '2026-11-18T00:00:00.000Z');
  });

  it('detects submissions inside the window', () => {
    const now = Date.parse('2026-11-18T00:10:00.000Z');
    assert.equal(
      isWithinEnquiryCooldown({
        lastSubmissionAt: '2026-11-18T00:05:00.000Z',
        nowMs: now,
        windowMs: ENQUIRY_COOLDOWN_MS,
      }),
      true,
    );
    assert.equal(
      isWithinEnquiryCooldown({
        lastSubmissionAt: '2026-11-17T23:00:00.000Z',
        nowMs: now,
        windowMs: ENQUIRY_COOLDOWN_MS,
      }),
      false,
    );
  });
});

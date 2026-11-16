import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  associationKindLabel,
  crossCustomerErrorMessage,
  duplicateAssociationErrorMessage,
  formatAudFromCents,
  isJobQuoteKind,
  mergeJobQuoteAssociations,
  nextPrimaryQuoteId,
  quoteCustomersCompatible,
  quoteTotalIncGstCents,
  resolvePrimaryOnLink,
} from './job-quotes.ts';

describe('quoteCustomersCompatible', () => {
  it('allows when either side is missing a customer', () => {
    assert.equal(quoteCustomersCompatible(null, 'c1'), true);
    assert.equal(quoteCustomersCompatible('c1', null), true);
    assert.equal(quoteCustomersCompatible(undefined, undefined), true);
  });

  it('rejects cross-customer links', () => {
    assert.equal(quoteCustomersCompatible('c1', 'c2'), false);
    assert.equal(quoteCustomersCompatible('c1', 'c1'), true);
  });
});

describe('mergeJobQuoteAssociations', () => {
  it('preserves legacy single-quote when join table is empty', () => {
    const rows = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'q-legacy',
      associations: [],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].quoteId, 'q-legacy');
    assert.equal(rows[0].isPrimary, true);
    assert.equal(rows[0].source, 'legacy_quote_id');
  });

  it('supports multiple quotes and keeps one primary first', () => {
    const rows = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'q1',
      associations: [
        {
          quoteId: 'q2',
          isPrimary: false,
          associationKind: 'variation',
          label: 'Variation A',
          linkedAt: '2026-11-16T02:00:00Z',
          source: 'job_quotes',
        },
        {
          quoteId: 'q1',
          isPrimary: true,
          associationKind: 'quote',
          label: null,
          linkedAt: '2026-11-16T01:00:00Z',
          source: 'job_quotes',
        },
        {
          quoteId: 'q3',
          isPrimary: false,
          associationKind: 'additional_works',
          label: null,
          linkedAt: '2026-11-16T03:00:00Z',
          source: 'job_quotes',
        },
      ],
    });
    assert.equal(rows.length, 3);
    assert.equal(rows[0].quoteId, 'q1');
    assert.equal(rows[0].isPrimary, true);
    assert.deepEqual(
      rows.map((r) => r.quoteId),
      ['q1', 'q2', 'q3'],
    );
  });

  it('does not double-count primary present in both legacy and join', () => {
    const rows = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'q1',
      associations: [
        {
          quoteId: 'q1',
          isPrimary: true,
          associationKind: 'quote',
          label: null,
          linkedAt: '2026-11-16T01:00:00Z',
          source: 'job_quotes',
        },
      ],
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'job_quotes');
  });

  it('promotes legacy primary when join rows lack is_primary', () => {
    const rows = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'q1',
      associations: [
        {
          quoteId: 'q1',
          isPrimary: false,
          associationKind: 'quote',
          label: null,
          source: 'job_quotes',
        },
      ],
    });
    assert.equal(rows[0].isPrimary, true);
  });
});

describe('resolvePrimaryOnLink', () => {
  it('makes the first link primary', () => {
    const result = resolvePrimaryOnLink({
      makePrimary: false,
      existing: [],
      quoteId: 'q-new',
    });
    assert.equal(result.quoteIsPrimary, true);
    assert.deepEqual(result.demoteQuoteIds, []);
  });

  it('keeps additional links non-primary when a primary exists', () => {
    const result = resolvePrimaryOnLink({
      makePrimary: false,
      existing: [{ quoteId: 'q1', isPrimary: true }],
      quoteId: 'q2',
    });
    assert.equal(result.quoteIsPrimary, false);
  });

  it('demotes previous primary when makePrimary is set', () => {
    const result = resolvePrimaryOnLink({
      makePrimary: true,
      existing: [
        { quoteId: 'q1', isPrimary: true },
        { quoteId: 'q2', isPrimary: false },
      ],
      quoteId: 'q2',
    });
    assert.equal(result.quoteIsPrimary, true);
    assert.deepEqual(result.demoteQuoteIds, ['q1']);
  });
});

describe('nextPrimaryQuoteId', () => {
  it('clears primary when none remain after unlink', () => {
    assert.equal(nextPrimaryQuoteId([{ quoteId: 'q2', isPrimary: false }]), null);
  });

  it('returns the designated primary', () => {
    assert.equal(
      nextPrimaryQuoteId([
        { quoteId: 'q2', isPrimary: false },
        { quoteId: 'q1', isPrimary: true },
      ]),
      'q1',
    );
  });
});

describe('quote totals and labels', () => {
  it('computes inc-GST totals for display', () => {
    const total = quoteTotalIncGstCents([
      { quantity: 2, unit_price_cents: 10000, gst_applicable: true },
      { quantity: 1, unit_price_cents: 5000, gst_applicable: false },
    ]);
    // 2*10000 = 20000 + 2000 GST + 5000 = 27000
    assert.equal(total, 27000);
    assert.equal(formatAudFromCents(27000), '$270.00');
  });

  it('filters fixed-price marker lines in detailed mode', () => {
    const total = quoteTotalIncGstCents(
      [
        {
          description: 'Labour',
          category: 'labour',
          quantity: 1,
          unit_price_cents: 10000,
          gst_applicable: true,
        },
        {
          description: 'Fixed-price electrical work',
          category: 'other',
          quantity: 1,
          unit_price_cents: 99900,
          gst_applicable: true,
        },
      ],
      'detailed',
    );
    assert.equal(total, 11000);
  });

  it('labels association kinds for the Quotes tab', () => {
    assert.equal(associationKindLabel('quote'), 'Quote');
    assert.equal(associationKindLabel('variation'), 'Variation');
    assert.equal(associationKindLabel('additional_works'), 'Additional works');
    assert.equal(isJobQuoteKind('variation'), true);
    assert.equal(isJobQuoteKind('revision'), false);
  });

  it('exposes stable office-facing error copy', () => {
    assert.match(duplicateAssociationErrorMessage(), /already linked/i);
    assert.match(crossCustomerErrorMessage(), /same customer/i);
  });
});

describe('concurrent association changes', () => {
  it('treats a second primary request as a demote-then-promote plan', () => {
    // Two overlapping "make primary" actions should both compute demotions from the
    // same snapshot; the unique primary index remains the database safety net.
    const first = resolvePrimaryOnLink({
      makePrimary: true,
      existing: [{ quoteId: 'q1', isPrimary: true }, { quoteId: 'q2', isPrimary: false }],
      quoteId: 'q2',
    });
    const second = resolvePrimaryOnLink({
      makePrimary: true,
      existing: [{ quoteId: 'q1', isPrimary: true }, { quoteId: 'q2', isPrimary: false }],
      quoteId: 'q3',
    });
    assert.deepEqual(first.demoteQuoteIds, ['q1']);
    assert.deepEqual(second.demoteQuoteIds, ['q1']);
    assert.equal(first.quoteIsPrimary, true);
    assert.equal(second.quoteIsPrimary, true);
  });
});

describe('create-job-from-quote compatibility', () => {
  it('treats create-job quote_id as displayable primary before join backfill', () => {
    // Mirrors post-create state: jobs.quote_id set, job_quotes may lag or be absent.
    const rows = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'quote-from-create',
      associations: [],
    });
    assert.equal(rows[0]?.quoteId, 'quote-from-create');
    assert.equal(rows[0]?.isPrimary, true);
  });

  it('after backfill, join row + quote_id still render once', () => {
    const rows = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'quote-from-create',
      associations: [
        {
          quoteId: 'quote-from-create',
          isPrimary: true,
          associationKind: 'quote',
          label: null,
          source: 'job_quotes',
        },
      ],
    });
    assert.equal(rows.length, 1);
  });
});

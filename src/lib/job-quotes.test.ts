import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  associationKindLabel,
  canLinkQuoteToJob,
  concurrentPrimaryChangeErrorMessage,
  crossCustomerErrorMessage,
  duplicateAssociationErrorMessage,
  formatAudFromCents,
  classifyPrimarySyncOutcome,
  interpretJobQuoteAtomicResult,
  isJobQuoteKind,
  jobCustomerRequiredErrorMessage,
  mergeJobQuoteAssociations,
  nextPrimaryQuoteId,
  orphanDraftRecoveryMessage,
  quoteCustomerRequiredErrorMessage,
  quoteCustomersCompatible,
  quoteTotalIncGstCents,
  resolvePrimaryOnLink,
  unlinkQuoteConfirmMessage,
} from './job-quotes.ts';

describe('quoteCustomersCompatible', () => {
  it('requires both sides to be set and matching for compatibility', () => {
    assert.equal(quoteCustomersCompatible(null, 'c1'), false);
    assert.equal(quoteCustomersCompatible('c1', null), false);
    assert.equal(quoteCustomersCompatible(undefined, undefined), true);
    assert.equal(quoteCustomersCompatible('c1', 'c2'), false);
    assert.equal(quoteCustomersCompatible('c1', 'c1'), true);
  });
});

describe('canLinkQuoteToJob', () => {
  it('blocks jobs without a customer from linking any quote', () => {
    const result = canLinkQuoteToJob(null, 'c1');
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.message, jobCustomerRequiredErrorMessage());
  });

  it('blocks quotes without a customer even when the job has one', () => {
    const result = canLinkQuoteToJob('c1', null);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.message, quoteCustomerRequiredErrorMessage());
  });

  it('blocks cross-customer links and allows matching customers', () => {
    const bad = canLinkQuoteToJob('c1', 'c2');
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.message, crossCustomerErrorMessage());
    assert.deepEqual(canLinkQuoteToJob('c1', 'c1'), { ok: true });
  });
});

describe('unlink confirmation and atomic result interpretation', () => {
  it('explains unlink vs delete and primary clearance', () => {
    const normal = unlinkQuoteConfirmMessage({ quoteNumber: 'EEQ-000001', isPrimary: false });
    assert.match(normal, /Unlink EEQ-000001/);
    assert.match(normal, /quote and its history stay/i);
    assert.doesNotMatch(normal, /no primary quote/);

    const primary = unlinkQuoteConfirmMessage({ quoteNumber: 'EEQ-000002', isPrimary: true });
    assert.match(primary, /no primary quote until you select another/i);
    assert.match(primary, /association/i);
  });

  it('interprets atomic RPC payloads and concurrent conflict copy', () => {
    assert.deepEqual(interpretJobQuoteAtomicResult({ ok: true, message: 'Quote linked.', isPrimary: true }, 'fail'), {
      ok: true,
      message: 'Quote linked.',
      isPrimary: true,
      clearedPrimary: false,
      quoteId: undefined,
    });
    assert.equal(
      interpretJobQuoteAtomicResult(null, 'Unable to link quote.').message,
      'Unable to link quote.',
    );
    assert.equal(
      interpretJobQuoteAtomicResult(
        { ok: false, message: concurrentPrimaryChangeErrorMessage() },
        'fail',
      ).message,
      concurrentPrimaryChangeErrorMessage(),
    );
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
    // same snapshot; the unique primary index + job row lock remain the database safety net.
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

  it('treats failed atomic RPC payloads as full rollback (no partial primary sync)', () => {
    const failed = interpretJobQuoteAtomicResult(
      { ok: false, message: concurrentPrimaryChangeErrorMessage() },
      'Unable to set primary quote.',
    );
    assert.equal(failed.ok, false);
    assert.equal(failed.isPrimary, false);
    assert.equal(failed.clearedPrimary, false);
    assert.match(failed.message || '', /same time/i);
  });
});

describe('create-and-link and sync outcomes', () => {
  it('skips sync when C1 migrations are absent and fails loudly when present', () => {
    assert.deepEqual(
      classifyPrimarySyncOutcome({
        missingMigration: true,
        result: { ok: false, message: 'missing' },
      }),
      { status: 'skipped_missing_migration' },
    );
    assert.deepEqual(
      classifyPrimarySyncOutcome({
        missingMigration: false,
        result: { ok: true },
      }),
      { status: 'synced' },
    );
    const failed = classifyPrimarySyncOutcome({
      missingMigration: false,
      result: { ok: false, message: 'lock timeout' },
    });
    assert.equal(failed.status, 'failed');
    if (failed.status === 'failed') assert.match(failed.message, /lock timeout/);
  });

  it('documents recoverable orphan-draft messaging when a quote id is known', () => {
    assert.match(orphanDraftRecoveryMessage('q-123'), /Draft quote q-123/);
    assert.match(orphanDraftRecoveryMessage('q-123'), /Link existing quote/i);
  });

  it('reads quoteId from successful create-and-link payloads', () => {
    const result = interpretJobQuoteAtomicResult(
      { ok: true, quoteId: 'q-new', isPrimary: true, message: 'Draft quote created and linked.' },
      'fail',
    );
    assert.equal(result.ok, true);
    assert.equal(result.quoteId, 'q-new');
    assert.equal(result.isPrimary, true);
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

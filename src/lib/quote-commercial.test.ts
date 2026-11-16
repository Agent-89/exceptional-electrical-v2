import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  billingBlocksSupersessionMessage,
  billingReconciliationDeferredMessage,
  commercialCurrentLabel,
  isEligibleCommercialCurrentStatus,
  interpretMakeCurrentResult,
  nextRevisionNumber,
  onlyAcceptedCanBeCurrentMessage,
  pickCommercialCurrentBackfillId,
  quoteBuilderNewHref,
  quoteEditorReturnHref,
  quoteTypeFromParent,
  resolveCommercialCurrentQuoteId,
  resolveCommercialCurrentTotalCents,
  shouldAutoMakeCurrentOnAccept,
  validateVariationParentSelection,
  variationParentJobCompatible,
} from './quote-commercial.ts';

describe('quote-commercial helpers', () => {
  it('derives type and next revision from parent', () => {
    assert.equal(quoteTypeFromParent(null), 'standard');
    assert.equal(quoteTypeFromParent('abc'), 'variation');
    assert.equal(nextRevisionNumber(0), 1);
    assert.equal(nextRevisionNumber(2), 3);
    assert.equal(nextRevisionNumber(null), 1);
  });

  it('backfills commercial current from accepted quotes only', () => {
    assert.equal(isEligibleCommercialCurrentStatus('accepted'), true);
    assert.equal(isEligibleCommercialCurrentStatus('draft'), false);
    assert.equal(isEligibleCommercialCurrentStatus('approved'), false);
    assert.equal(isEligibleCommercialCurrentStatus('sent'), false);

    const mixed = [
      { id: 'd1', status: 'draft', createdAt: '2026-01-03' },
      { id: 'a1', status: 'approved', createdAt: '2026-01-02' },
      { id: 's1', status: 'sent', createdAt: '2026-01-04' },
      { id: 'c1', status: 'accepted', acceptedAt: '2026-01-01T10:00:00Z', createdAt: '2026-01-01' },
      { id: 'c2', status: 'accepted', acceptedAt: '2026-01-05T10:00:00Z', createdAt: '2026-01-05' },
    ];
    assert.equal(pickCommercialCurrentBackfillId(mixed), 'c2');

    // Older accepted may already be flagged current; winner is still latest accepted.
    assert.equal(
      pickCommercialCurrentBackfillId([
        { id: 'old', status: 'accepted', acceptedAt: '2026-01-01T10:00:00Z', createdAt: '2026-01-01' },
        { id: 'new', status: 'accepted', acceptedAt: '2026-01-09T10:00:00Z', createdAt: '2026-01-09' },
      ]),
      'new',
    );

    const noneAccepted = [
      { id: 'd1', status: 'draft' },
      { id: 'a1', status: 'approved' },
      { id: 's1', status: 'sent' },
    ];
    assert.equal(pickCommercialCurrentBackfillId(noneAccepted), null);
  });

  it('requires same-customer parent for variations', () => {
    const missing = validateVariationParentSelection({
      quoteType: 'variation',
      parentQuoteId: '',
      customerId: 'c1',
      parentCustomerId: 'c1',
    });
    assert.equal(missing.ok, false);

    const cross = validateVariationParentSelection({
      quoteType: 'variation',
      parentQuoteId: 'p1',
      customerId: 'c1',
      parentCustomerId: 'c2',
    });
    assert.equal(cross.ok, false);

    const ok = validateVariationParentSelection({
      quoteType: 'variation',
      parentQuoteId: 'p1',
      customerId: 'c1',
      parentCustomerId: 'c1',
    });
    assert.equal(ok.ok, true);
  });

  it('rejects parent linked to a different job', () => {
    assert.equal(
      variationParentJobCompatible({ jobId: 'job-a', parentLinkedJobIds: ['job-a'] }).ok,
      true,
    );
    assert.equal(
      variationParentJobCompatible({ jobId: 'job-a', parentLinkedJobIds: [] }).ok,
      true,
    );
    assert.equal(
      variationParentJobCompatible({ jobId: 'job-a', parentLinkedJobIds: ['job-b'] }).ok,
      false,
    );
  });

  it('accept path may make current for approved/sent quotes', () => {
    assert.equal(
      shouldAutoMakeCurrentOnAccept({ parentQuoteId: 'p', statusBeforeAccept: 'sent' }),
      true,
    );
    assert.equal(
      shouldAutoMakeCurrentOnAccept({ parentQuoteId: null, statusBeforeAccept: 'approved' }),
      true,
    );
    assert.equal(
      shouldAutoMakeCurrentOnAccept({ parentQuoteId: 'p', statusBeforeAccept: 'draft' }),
      false,
    );
  });

  it('resolves commercial current without summing superseded siblings', () => {
    const family = [
      { id: 'old', isCommercialCurrent: false, status: 'superseded', totalCents: 10000 },
      { id: 'new', isCommercialCurrent: true, status: 'accepted', totalCents: 15000 },
      { id: 'draft', isCommercialCurrent: false, status: 'draft', totalCents: 999 },
    ];
    assert.equal(resolveCommercialCurrentQuoteId(family), 'new');
    assert.equal(resolveCommercialCurrentTotalCents(family), 15000);
    assert.equal(
      resolveCommercialCurrentQuoteId([
        { id: 'a', isCommercialCurrent: true, status: 'approved' },
      ]),
      null,
    );
  });

  it('builds job return and variation builder hrefs', () => {
    assert.equal(quoteEditorReturnHref({ jobId: 'job-1', intent: 'continue' }), null);
    const ret = quoteEditorReturnHref({
      jobId: 'job-1',
      intent: 'return_to_job',
      quoteId: 'q-1',
    });
    assert.match(ret || '', /\/hq\/jobs\/job-1\?tab=quotes/);
    assert.match(ret || '', /notice=/);

    const href = quoteBuilderNewHref({
      jobId: 'job-1',
      type: 'variation',
      parentQuoteId: 'parent-1',
    });
    assert.match(href, /type=variation/);
    assert.match(href, /parent=parent-1/);
    assert.match(href, /job=job-1/);
  });

  it('interprets make-current / accept RPC payloads', () => {
    const ok = interpretMakeCurrentResult({
      ok: true,
      quoteId: 'q1',
      message: 'done',
      madeCommercialCurrent: true,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.madeCommercialCurrent, true);

    const blocked = interpretMakeCurrentResult({
      ok: false,
      message: billingBlocksSupersessionMessage(),
      requiresReview: true,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.requiresReview, true);
  });

  it('labels commercial current independently of primary and defers billing', () => {
    assert.equal(commercialCurrentLabel(true), 'Current commercial');
    assert.equal(commercialCurrentLabel(false), null);
    assert.match(onlyAcceptedCanBeCurrentMessage(), /Only accepted/);
    assert.match(billingReconciliationDeferredMessage(), /C2/);
  });
});

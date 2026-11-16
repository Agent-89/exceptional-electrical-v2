import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  billingBlocksSupersessionMessage,
  billingReconciliationDeferredMessage,
  buildVariationPrefillFromParent,
  canProceedToApproveAfterSave,
  commercialCurrentLabel,
  draftHasUnsavedCommercialContent,
  groupParentQuotesByJob,
  interpretSaveDraftAndLinkResult,
  isDuplicateAssociationMessage,
  isEligibleCommercialCurrentStatus,
  isValidVariationParentCandidate,
  interpretMakeCurrentResult,
  nextRevisionNumber,
  onlyAcceptedCanBeCurrentMessage,
  canChangePersistedQuoteCustomer,
  parentChainIntroducesCycle,
  parentRevisionChainTooDeepMessage,
  parentSwitchConfirmMessage,
  partialJobLinkFailureMessage,
  pickCommercialCurrentBackfillId,
  quoteBuilderHeading,
  quoteBuilderNewHref,
  quoteCustomerChangeBlockedMessage,
  quoteEditorReturnHref,
  quoteTypeFromParent,
  reconcileLinkedJobsForCustomerChange,
  resolveCommercialCurrentQuoteId,
  resolveCommercialCurrentTotalCents,
  shouldAutoMakeCurrentOnAccept,
  uniqueJobIds,
  validateVariationParentSelection,
  variationParentJobCompatible,
  variationTitleFromParent,
} from './quote-commercial.ts';
import { canLinkQuoteToJob, mergeJobQuoteAssociations } from './job-quotes.ts';

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

  it('allows same-customer parent from a different job or unlinked quote', () => {
    assert.equal(
      isValidVariationParentCandidate({
        candidateId: 'q-other-job',
        candidateStatus: 'accepted',
        candidateCustomerId: 'cust-1',
        quoteCustomerId: 'cust-1',
      }),
      true,
    );
    assert.equal(
      isValidVariationParentCandidate({
        candidateId: 'q-unlinked',
        candidateStatus: 'sent',
        candidateCustomerId: 'cust-1',
        quoteCustomerId: 'cust-1',
      }),
      true,
    );
    assert.equal(
      isValidVariationParentCandidate({
        candidateId: 'q-cross',
        candidateStatus: 'accepted',
        candidateCustomerId: 'cust-2',
        quoteCustomerId: 'cust-1',
      }),
      false,
    );
  });

  it('excludes self, ancestors, and disallowed statuses from parent candidates', () => {
    assert.equal(
      isValidVariationParentCandidate({
        candidateId: 'self',
        candidateStatus: 'draft',
        candidateCustomerId: 'c',
        quoteCustomerId: 'c',
        editingQuoteId: 'self',
      }),
      false,
    );
    assert.equal(
      isValidVariationParentCandidate({
        candidateId: 'ancestor',
        candidateStatus: 'accepted',
        candidateCustomerId: 'c',
        quoteCustomerId: 'c',
        editingAncestorIds: ['ancestor'],
      }),
      false,
    );
    assert.equal(
      isValidVariationParentCandidate({
        candidateId: 'x',
        candidateStatus: 'superseded',
        candidateCustomerId: 'c',
        quoteCustomerId: 'c',
      }),
      false,
    );
  });

  it('groups parent options by linked job without duplicating multi-job quotes', () => {
    const groups = groupParentQuotesByJob([
      {
        id: 'q1',
        quoteNumber: 'EEQ-000001',
        title: 'Board upgrade',
        status: 'accepted',
        linkedJobs: [
          { id: 'j1', jobNumber: 'JOB-1', title: 'Site A' },
          { id: 'j2', jobNumber: 'JOB-2', title: 'Site B' },
        ],
      },
      {
        id: 'q1',
        quoteNumber: 'EEQ-000001',
        title: 'Board upgrade',
        status: 'accepted',
        linkedJobs: [{ id: 'j2', jobNumber: 'JOB-2', title: 'Site B' }],
      },
      {
        id: 'q2',
        quoteNumber: 'EEQ-000002',
        title: 'Spare',
        status: 'draft',
        linkedJobs: [],
      },
    ]);
    const ids = groups.flatMap((g) => g.quotes.map((q) => q.id));
    assert.deepEqual(ids, ['q1', 'q2']);
    assert.ok(groups.some((g) => g.key === 'unlinked'));
    assert.ok(groups.some((g) => g.key === 'j1'));
  });

  it('prefills variation commercial content from immediate parent (fixed and detailed)', () => {
    const detailed = buildVariationPrefillFromParent({
      title: 'Switchboard',
      scope: 'Replace MSB',
      inclusions: 'Labour',
      exclusions: 'Council fees',
      notes: 'Customer note',
      internalNotes: 'Internal',
      display: 'itemised',
      mode: 'detailed',
      address: '1 Test St',
      addressId: 'addr-1',
      lines: [
        {
          description: 'Labour',
          category: 'labour',
          quantity: 4,
          unit: 'hour',
          price: 12000,
          cost: 6000,
          gst: true,
        },
        {
          description: 'Cable',
          category: 'material',
          quantity: 20,
          unit: 'm',
          price: 350,
          cost: 180,
          gst: false,
        },
      ],
    });
    assert.equal(detailed.title, 'Variation — Switchboard');
    assert.equal(detailed.scope, 'Replace MSB');
    assert.equal(detailed.lines[0].quantity, 4);
    assert.equal(detailed.lines[0].price, 12000);
    assert.equal(detailed.lines[0].cost, 6000);
    assert.equal(detailed.lines[0].gst, true);
    assert.equal(detailed.lines[1].gst, false);
    const originalLine = {
      description: 'Labour',
      category: 'labour',
      quantity: 4,
      unit: 'hour',
      price: 12000,
      cost: 6000,
      gst: true,
    };
    const fromSame = buildVariationPrefillFromParent({
      title: 'Switchboard',
      mode: 'detailed',
      lines: [originalLine],
    });
    fromSame.lines[0].price = 1;
    assert.equal(originalLine.price, 12000);

    const fixed = buildVariationPrefillFromParent({
      title: 'Variation — Switchboard',
      mode: 'fixed',
      display: 'total_only',
      lines: [
        {
          description: 'Fixed-price electrical work',
          category: 'other',
          quantity: 1,
          unit: 'each',
          price: 550000,
          cost: 300000,
          gst: true,
        },
      ],
    });
    assert.equal(fixed.title, 'Variation — Switchboard');
    assert.equal(fixed.mode, 'fixed');
    assert.equal(fixed.display, 'total_only');
    assert.equal(fixed.lines[0].price, 550000);
    assert.equal(fixed.lines[0].cost, 300000);
  });

  it('variation-of-variation uses immediate parent title/content helpers', () => {
    assert.equal(variationTitleFromParent('Variation — Board'), 'Variation — Board');
    const child = buildVariationPrefillFromParent({
      title: 'Variation — Board',
      scope: 'Rev 2 scope',
      mode: 'detailed',
      lines: [{ description: 'Item', category: 'other', quantity: 1, unit: 'each', price: 100, cost: null, gst: true }],
    });
    assert.equal(child.scope, 'Rev 2 scope');
    assert.equal(child.lines[0].price, 100);
  });

  it('detects unsaved content and requires parent-switch confirmation copy', () => {
    assert.equal(draftHasUnsavedCommercialContent({ title: '', scope: '', lines: [] }), false);
    assert.equal(draftHasUnsavedCommercialContent({ title: 'Work', scope: '', lines: [] }), true);
    assert.equal(
      draftHasUnsavedCommercialContent({
        title: '',
        lines: [{ description: 'x', category: 'other', quantity: 1, unit: 'each', price: 0, cost: null, gst: true }],
      }),
      true,
    );
    assert.match(parentSwitchConfirmMessage(), /Replace the current quote content/);
  });

  it('dedupes multi-job association ids and rejects cross-customer links', () => {
    assert.deepEqual(uniqueJobIds(['a', 'a', '', 'b', null]), ['a', 'b']);
    assert.equal(canLinkQuoteToJob('c1', 'c1').ok, true);
    assert.equal(canLinkQuoteToJob('c1', 'c2').ok, false);
    const merged = mergeJobQuoteAssociations({
      legacyPrimaryQuoteId: 'q1',
      associations: [
        { quoteId: 'q1', isPrimary: true, associationKind: 'quote', label: null, source: 'job_quotes' },
        { quoteId: 'q2', isPrimary: false, associationKind: 'quote', label: null, source: 'job_quotes' },
      ],
    });
    assert.equal(merged.filter((r) => r.quoteId === 'q1').length, 1);
  });

  it('returns unlinked quotes to quote detail and compact builder headings', () => {
    assert.equal(
      quoteEditorReturnHref({ jobId: null, intent: 'return_to_quotes', quoteId: 'q9' }),
      '/hq/quotes/q9',
    );
    assert.equal(quoteBuilderHeading({ savedNumber: null, quoteType: 'standard' }), 'New Quote');
    assert.equal(quoteBuilderHeading({ savedNumber: null, quoteType: 'variation' }), 'New Variation');
    assert.equal(quoteBuilderHeading({ savedNumber: 'EEQ-000042', quoteType: 'variation' }), 'EEQ-000042');
  });

  it('keeps commercial-current families independent and primary separate conceptually', () => {
    const familyA = [
      { id: 'a1', isCommercialCurrent: true, status: 'accepted', totalCents: 1000 },
      { id: 'a2', isCommercialCurrent: false, status: 'superseded', totalCents: 900 },
    ];
    const familyB = [
      { id: 'b1', isCommercialCurrent: true, status: 'accepted', totalCents: 5000 },
    ];
    assert.equal(resolveCommercialCurrentQuoteId(familyA), 'a1');
    assert.equal(resolveCommercialCurrentQuoteId(familyB), 'b1');
    assert.notEqual(resolveCommercialCurrentQuoteId(familyA), resolveCommercialCurrentQuoteId(familyB));
    // Job primary is not derived from commercial current helpers.
    assert.equal(commercialCurrentLabel(true), 'Current commercial');
  });

  it('treats duplicate job links as idempotent and blocks approve on partial link failure', () => {
    assert.equal(isDuplicateAssociationMessage('That quote is already linked to this job.'), true);
    assert.equal(isDuplicateAssociationMessage('Quotes must belong to the same customer as the job.'), false);

    assert.equal(canProceedToApproveAfterSave({ saveOk: true, linkStatus: 'complete' }), true);
    assert.equal(canProceedToApproveAfterSave({ saveOk: true, linkStatus: 'none' }), true);
    assert.equal(canProceedToApproveAfterSave({ saveOk: true, linkStatus: 'partial' }), false);
    assert.equal(canProceedToApproveAfterSave({ saveOk: false, linkStatus: 'rolled_back' }), false);

    const partial = partialJobLinkFailureMessage({
      savedQuoteId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      failedMessages: ['Quotes must belong to the same customer as the job.'],
      linkedCount: 1,
      requestedCount: 2,
    });
    assert.match(partial, /incomplete/);
    assert.match(partial, /Approval|approving|Linked jobs/i);

    const parsed = interpretSaveDraftAndLinkResult({
      ok: true,
      quoteId: 'q1',
      linkedJobIds: ['j1', 'j2'],
      duplicateCount: 1,
      message: 'Draft saved and linked to jobs.',
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.linkedJobIds, ['j1', 'j2']);
    assert.equal(parsed.duplicateCount, 1);
  });

  it('rejects circular parent chains and clears jobs when customer changes', () => {
    assert.equal(
      parentChainIntroducesCycle({
        parentId: 'p1',
        editingQuoteId: 'p1',
        parentAncestorIds: [],
      }).ok,
      false,
    );
    assert.equal(
      parentChainIntroducesCycle({
        parentId: 'p1',
        editingQuoteId: 'child',
        parentAncestorIds: ['child'],
      }).ok,
      false,
    );
    assert.equal(
      parentChainIntroducesCycle({
        parentId: 'p1',
        editingQuoteId: 'child',
        parentAncestorIds: ['p1', 'root'],
      }).ok,
      false,
    );
    assert.equal(
      parentChainIntroducesCycle({
        parentId: 'p1',
        editingQuoteId: 'child',
        parentAncestorIds: ['root'],
      }).ok,
      true,
    );
    assert.equal(
      parentChainIntroducesCycle({
        parentId: 'p1',
        parentAncestorIds: Array.from({ length: 20 }, (_, i) => `a${i}`),
        chainExceedsMaxDepth: true,
      }).ok,
      false,
    );
    assert.match(parentRevisionChainTooDeepMessage(), /too deep/);

    assert.deepEqual(
      reconcileLinkedJobsForCustomerChange({
        previousCustomerId: 'c1',
        nextCustomerId: 'c2',
        linkedJobIds: ['j1', 'j2'],
      }),
      [],
    );
    assert.deepEqual(
      reconcileLinkedJobsForCustomerChange({
        previousCustomerId: 'c1',
        nextCustomerId: 'c1',
        linkedJobIds: ['j1', 'j1'],
      }),
      ['j1'],
    );
  });

  it('blocks customer change on persisted quotes with job associations until unlinked', () => {
    // Unsaved draft may change customer even with pending job selections (cleared in UI).
    assert.equal(
      canChangePersistedQuoteCustomer({
        quoteIsPersisted: false,
        previousCustomerId: 'c1',
        nextCustomerId: 'c2',
        associatedJobCount: 2,
      }).ok,
      true,
    );

    // Saved standard quote with one linked job.
    const standardBlocked = canChangePersistedQuoteCustomer({
      quoteIsPersisted: true,
      previousCustomerId: 'c1',
      nextCustomerId: 'c2',
      associatedJobCount: 1,
    });
    assert.equal(standardBlocked.ok, false);
    assert.equal(standardBlocked.ok === false && standardBlocked.message, quoteCustomerChangeBlockedMessage());

    // Variation with multiple linked jobs.
    assert.equal(
      canChangePersistedQuoteCustomer({
        quoteIsPersisted: true,
        previousCustomerId: 'c1',
        nextCustomerId: 'c2',
        associatedJobCount: 3,
      }).ok,
      false,
    );

    // Legacy association still counts as associatedJobCount >= 1.
    assert.equal(
      canChangePersistedQuoteCustomer({
        quoteIsPersisted: true,
        previousCustomerId: 'c1',
        nextCustomerId: 'c2',
        associatedJobCount: 1,
      }).ok,
      false,
    );

    // Same customer is fine.
    assert.equal(
      canChangePersistedQuoteCustomer({
        quoteIsPersisted: true,
        previousCustomerId: 'c1',
        nextCustomerId: 'c1',
        associatedJobCount: 2,
      }).ok,
      true,
    );

    // After safe unlinking, customer change is allowed.
    assert.equal(
      canChangePersistedQuoteCustomer({
        quoteIsPersisted: true,
        previousCustomerId: 'c1',
        nextCustomerId: 'c2',
        associatedJobCount: 0,
      }).ok,
      true,
    );
  });
});

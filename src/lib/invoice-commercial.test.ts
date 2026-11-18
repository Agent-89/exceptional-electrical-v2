import assert from 'node:assert/strict';
import {describe,it} from 'node:test';
import {
  canLinkInvoiceToJob,
  canRecordInvoicePayment,
  canVoidInvoice,
  deriveInvoiceStatusAfterPayments,
  filterInvoiceLinesForPricing,
  FIXED_INVOICE_LINE,
  formatJobRef,
  invoiceAmountDueCents,
  invoicePaidCents,
  invoiceTotalsCents,
  isEditableInvoiceStatus,
  isInvoiceStatus,
  isPrintableInvoiceStatus,
} from './invoice-commercial.ts';

describe('invoice-commercial', () => {
  it('recognises invoice statuses', () => {
    assert.equal(isInvoiceStatus('draft'), true);
    assert.equal(isInvoiceStatus('part_paid'), true);
    assert.equal(isInvoiceStatus('accepted'), false);
  });

  it('gates edit / print / payment / void by status', () => {
    assert.equal(isEditableInvoiceStatus('draft'), true);
    assert.equal(isEditableInvoiceStatus('sent'), false);
    assert.equal(isPrintableInvoiceStatus('approved'), true);
    assert.equal(isPrintableInvoiceStatus('draft'), false);
    assert.equal(canRecordInvoicePayment('sent'), true);
    assert.equal(canRecordInvoicePayment('draft'), false);
    assert.equal(canVoidInvoice('sent'), true);
    assert.equal(canVoidInvoice('paid'), false);
  });

  it('totals detailed lines with GST', () => {
    const totals = invoiceTotalsCents(
      [
        {description: 'Labour', category: 'labour', quantity: 2, unit_price_cents: 10000, gst_applicable: true},
        {description: FIXED_INVOICE_LINE, category: 'other', quantity: 1, unit_price_cents: 50000, gst_applicable: true},
      ],
      'detailed',
    );
    assert.equal(totals.subtotalExGstCents, 20000);
    assert.equal(totals.gstCents, 2000);
    assert.equal(totals.totalIncGstCents, 22000);
  });

  it('uses only the fixed marker in fixed mode', () => {
    const lines = filterInvoiceLinesForPricing(
      [
        {description: 'Labour', category: 'labour', quantity: 2, unit_price_cents: 10000, gst_applicable: true},
        {description: FIXED_INVOICE_LINE, category: 'other', quantity: 1, unit_price_cents: 50000, gst_applicable: true},
      ],
      'fixed',
    );
    assert.equal(lines.length, 1);
    assert.equal(invoiceTotalsCents(lines, 'fixed').totalIncGstCents, 55000);
  });

  it('computes amount due from payments', () => {
    const items = [
      {description: 'Work', category: 'other', quantity: 1, unit_price_cents: 10000, gst_applicable: true},
    ];
    assert.equal(invoicePaidCents([{amount_cents: 4000}, {amount_cents: 2000}]), 6000);
    assert.equal(
      invoiceAmountDueCents({items, payments: [{amount_cents: 5000}], pricingMode: 'detailed'}),
      6000,
    );
    assert.equal(
      invoiceAmountDueCents({items, payments: [{amount_cents: 5000}], status: 'void'}),
      0,
    );
  });

  it('derives part_paid and paid statuses', () => {
    assert.equal(
      deriveInvoiceStatusAfterPayments({currentStatus: 'sent', totalIncGstCents: 11000, paidCents: 5000}),
      'part_paid',
    );
    assert.equal(
      deriveInvoiceStatusAfterPayments({currentStatus: 'part_paid', totalIncGstCents: 11000, paidCents: 11000}),
      'paid',
    );
    assert.equal(
      deriveInvoiceStatusAfterPayments({currentStatus: 'paid', totalIncGstCents: 11000, paidCents: 0}),
      'sent',
    );
    assert.equal(
      deriveInvoiceStatusAfterPayments({currentStatus: 'void', totalIncGstCents: 11000, paidCents: 100}),
      'void',
    );
  });

  it('requires matching customers for job links', () => {
    assert.equal(canLinkInvoiceToJob('c1', 'c1').ok, true);
    assert.equal(canLinkInvoiceToJob('c1', 'c2').ok, false);
    assert.equal(canLinkInvoiceToJob('', 'c1').ok, false);
  });

  it('formats job refs', () => {
    assert.equal(formatJobRef(574), 'JB00574');
    assert.equal(formatJobRef('JB12'), 'JB12');
    assert.equal(formatJobRef(null), null);
  });
});

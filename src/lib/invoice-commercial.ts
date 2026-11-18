/** Pure helpers for HQ invoices (C2 surface — no Xero). */

export const INVOICE_STATUSES = [
  'draft',
  'approved',
  'sent',
  'part_paid',
  'paid',
  'void',
] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_PAYMENT_METHODS = [
  'bank_transfer',
  'card',
  'cash',
  'cheque',
  'other',
] as const;

export type InvoicePaymentMethod = (typeof INVOICE_PAYMENT_METHODS)[number];

export const INVOICE_LINE_CATEGORIES = [
  'labour',
  'material',
  'equipment',
  'subcontractor',
  'other',
] as const;

export type InvoiceLineCategory = (typeof INVOICE_LINE_CATEGORIES)[number];

export const FIXED_INVOICE_LINE = 'Fixed-price electrical work';

export type InvoiceLineForTotal = {
  description?: string | null;
  category?: string | null;
  quantity: number | string;
  unit_price_cents: number | string;
  gst_applicable?: boolean | null;
};

export type InvoicePaymentForTotal = {
  amount_cents: number | string;
};

export function isInvoiceStatus(value: string): value is InvoiceStatus {
  return (INVOICE_STATUSES as readonly string[]).includes(value);
}

export function isInvoicePaymentMethod(value: string): value is InvoicePaymentMethod {
  return (INVOICE_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function invoiceStatusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

export function isEditableInvoiceStatus(status: string) {
  return status === 'draft';
}

export function isPrintableInvoiceStatus(status: string) {
  return status !== 'draft' && status !== 'void';
}

export function canApproveInvoice(status: string) {
  return status === 'draft';
}

export function canMarkInvoiceSent(status: string) {
  return status === 'approved' || status === 'sent';
}

export function canRecordInvoicePayment(status: string) {
  return status === 'approved' || status === 'sent' || status === 'part_paid' || status === 'paid';
}

export function canVoidInvoice(status: string) {
  return status !== 'void' && status !== 'paid';
}

export function isFixedInvoiceLine(line: InvoiceLineForTotal) {
  return line.category === 'other' && line.description === FIXED_INVOICE_LINE;
}

export function filterInvoiceLinesForPricing(
  items: InvoiceLineForTotal[] | null | undefined,
  pricingMode: string | null | undefined = 'detailed',
): InvoiceLineForTotal[] {
  if (!items?.length) return [];
  const mode = pricingMode || 'detailed';
  return items.filter((line) => {
    const fixed = isFixedInvoiceLine(line);
    return mode === 'fixed' ? fixed : !fixed;
  });
}

export function invoiceLineExGstCents(line: InvoiceLineForTotal) {
  const qty = Number(line.quantity) || 0;
  const unit = Number(line.unit_price_cents) || 0;
  return Math.round(qty * unit);
}

export function invoiceLineGstCents(line: InvoiceLineForTotal) {
  if (!line.gst_applicable) return 0;
  return Math.round(invoiceLineExGstCents(line) * 0.1);
}

export function invoiceTotalsCents(
  items: InvoiceLineForTotal[] | null | undefined,
  pricingMode: string | null | undefined = 'detailed',
) {
  const lines = filterInvoiceLinesForPricing(items, pricingMode);
  const subtotalExGst = lines.reduce((sum, line) => sum + invoiceLineExGstCents(line), 0);
  const gst = lines.reduce((sum, line) => sum + invoiceLineGstCents(line), 0);
  return {
    subtotalExGstCents: subtotalExGst,
    gstCents: gst,
    totalIncGstCents: subtotalExGst + gst,
  };
}

export function invoicePaidCents(payments: InvoicePaymentForTotal[] | null | undefined) {
  if (!payments?.length) return 0;
  return payments.reduce((sum, payment) => sum + (Number(payment.amount_cents) || 0), 0);
}

export function invoiceAmountDueCents(args: {
  items: InvoiceLineForTotal[] | null | undefined;
  payments: InvoicePaymentForTotal[] | null | undefined;
  pricingMode?: string | null;
  status?: string | null;
}) {
  if (args.status === 'void') return 0;
  const total = invoiceTotalsCents(args.items, args.pricingMode).totalIncGstCents;
  return Math.max(0, total - invoicePaidCents(args.payments));
}

/** Derive payment-facing status after a payment change (never drafts/void). */
export function deriveInvoiceStatusAfterPayments(args: {
  currentStatus: string;
  totalIncGstCents: number;
  paidCents: number;
}): InvoiceStatus {
  const current = isInvoiceStatus(args.currentStatus) ? args.currentStatus : 'sent';
  if (current === 'draft' || current === 'void') return current;
  if (args.paidCents <= 0) {
    if (current === 'part_paid' || current === 'paid') return 'sent';
    return current === 'approved' ? 'approved' : 'sent';
  }
  if (args.totalIncGstCents > 0 && args.paidCents >= args.totalIncGstCents) return 'paid';
  return 'part_paid';
}

export function formatAudFromCents(cents: number) {
  return (cents / 100).toLocaleString('en-AU', {style: 'currency', currency: 'AUD'});
}

export function formatJobRef(raw: string | number | null | undefined) {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim();
  if (/^JB\d+$/i.test(value)) return value.toUpperCase();
  if (/^\d+$/.test(value)) return 'JB' + value.padStart(5, '0');
  return value;
}

export function invoiceBuilderHeading(args: {
  invoiceNumber?: string | null;
  isNew?: boolean;
}) {
  if (args.isNew) return 'New invoice';
  return args.invoiceNumber ? `Invoice ${args.invoiceNumber}` : 'Invoice';
}

export function canLinkInvoiceToJob(
  invoiceCustomerId: string | null | undefined,
  jobCustomerId: string | null | undefined,
): {ok: true} | {ok: false; message: string} {
  if (!invoiceCustomerId) {
    return {ok: false, message: 'Select a customer before linking a job.'};
  }
  if (!jobCustomerId) {
    return {ok: false, message: 'That job has no customer assigned.'};
  }
  if (invoiceCustomerId !== jobCustomerId) {
    return {ok: false, message: 'Invoice and job must belong to the same customer.'};
  }
  return {ok: true};
}

export function isMissingInvoiceSchemaError(error: {message?: string; code?: string} | null | undefined) {
  if (!error) return false;
  const message = error.message || '';
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation ["']?public\.?invoices["']? does not exist/i.test(message) ||
    /Could not find the table ['"]public\.invoices['"]/i.test(message)
  );
}

export function missingInvoiceSchemaMessage() {
  return 'Invoices need the hq_invoices_c2 migration before they can be used.';
}

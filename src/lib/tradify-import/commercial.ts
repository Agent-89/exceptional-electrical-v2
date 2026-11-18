/** Group Tradify quote/invoice line-item CSV rows into HQ-shaped documents. */

import {
  collapseWhitespace,
  extractJobNumbersFromCell,
  mapTradifyInvoiceStatus,
  mapTradifyQuoteStatus,
  normalizeJobNumber,
  parseMoneyToCents,
  parseTradifyAmPmToUtc,
  type HqInvoiceStatus,
  type HqQuoteStatus,
} from './normalize.ts';
import type {StagedRow} from './dry-run.ts';

export type QuoteLine = {
  position: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  section?: string;
  code?: string;
};

export type GroupedQuote = {
  quoteNo: string;
  customerName: string;
  reference: string;
  description: string;
  quoteDate: string;
  expiryDate: string;
  status: HqQuoteStatus;
  tradifyStatus: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  jobNumbers: string[];
  lines: QuoteLine[];
  sourceRowNumbers: number[];
};

export type InvoiceLine = {
  position: number;
  description: string;
  quantity: number;
  unitPriceCents: number;
  code?: string;
};

export type GroupedInvoice = {
  invoiceNumber: string;
  customerName: string;
  reference: string;
  description: string;
  invoiceDate: string;
  dueDate: string;
  deliveryStatus: string;
  status: HqInvoiceStatus;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  dueCents: number;
  jobNumbers: string[];
  lines: InvoiceLine[];
  sourceRowNumbers: number[];
};

function parseQty(raw: string): number {
  const n = Number(collapseWhitespace(raw).replace(/,/g, ''));
  return Number.isFinite(n) && n !== 0 ? n : 1;
}

export function groupQuoteRows(rows: StagedRow[]): GroupedQuote[] {
  const byNo = new Map<string, StagedRow[]>();
  for (const row of rows) {
    const quoteNo = collapseWhitespace(row.payload['Quote No'] || '');
    if (!quoteNo) continue;
    const list = byNo.get(quoteNo) || [];
    list.push(row);
    byNo.set(quoteNo, list);
  }

  const out: GroupedQuote[] = [];
  for (const [quoteNo, group] of [...byNo.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const head = group[0]!;
    const tradifyStatus = collapseWhitespace(head.payload['Status'] || 'Draft');
    const lines: QuoteLine[] = group.map((row, idx) => {
      const lineNo = Number(row.payload['Line Number'] || idx + 1);
      const desc =
        collapseWhitespace(row.payload['Line Description'] || '') ||
        collapseWhitespace(row.payload['Description'] || '') ||
        'Line item';
      const unitSell = row.payload['Line Unit Sell Price'] || row.payload['Line Unit Price'] || '0';
      return {
        position: Number.isFinite(lineNo) ? lineNo : idx + 1,
        description: desc,
        quantity: parseQty(row.payload['Line Quantity'] || '1'),
        unitPriceCents: parseMoneyToCents(unitSell),
        section: collapseWhitespace(row.payload['Section'] || '') || undefined,
        code: collapseWhitespace(row.payload['Line Item Code'] || '') || undefined,
      };
    });
    lines.sort((a, b) => a.position - b.position);

    const jobNumbers = [
      ...new Set(group.flatMap((r) => extractJobNumbersFromCell(r.payload['Jobs'] || ''))),
    ];

    out.push({
      quoteNo,
      customerName: collapseWhitespace(head.payload['Customer Name'] || ''),
      reference: collapseWhitespace(head.payload['Reference'] || ''),
      description: collapseWhitespace(head.payload['Description'] || ''),
      quoteDate: collapseWhitespace(head.payload['Quote Date'] || '').slice(0, 10),
      expiryDate: collapseWhitespace(head.payload['Expiry Date'] || '').slice(0, 10),
      status: mapTradifyQuoteStatus(tradifyStatus),
      tradifyStatus,
      subtotalCents: parseMoneyToCents(head.payload['Subtotal'] || '0'),
      taxCents: parseMoneyToCents(head.payload['Tax'] || '0'),
      totalCents: parseMoneyToCents(head.payload['Total'] || '0'),
      jobNumbers,
      lines,
      sourceRowNumbers: group.map((r) => r.rowNumber),
    });
  }
  return out;
}

export function groupInvoiceRows(rows: StagedRow[]): GroupedInvoice[] {
  const byNo = new Map<string, StagedRow[]>();
  for (const row of rows) {
    const invoiceNumber = collapseWhitespace(row.payload['Invoice Number'] || '');
    if (!invoiceNumber) continue;
    const list = byNo.get(invoiceNumber) || [];
    list.push(row);
    byNo.set(invoiceNumber, list);
  }

  const out: GroupedInvoice[] = [];
  for (const [invoiceNumber, group] of [...byNo.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const head = group[0]!;
    const paidCents = parseMoneyToCents(head.payload['Paid'] || '0');
    const dueCents = parseMoneyToCents(head.payload['Due'] || '0');
    const totalCents = parseMoneyToCents(head.payload['Total'] || '0');
    const deliveryStatus = collapseWhitespace(head.payload['Delivery Status'] || '');

    const lines: InvoiceLine[] = group.map((row, idx) => {
      const lineNo = Number(row.payload['Line Number'] || idx + 1);
      const desc =
        collapseWhitespace(row.payload['Line Description'] || '') ||
        collapseWhitespace(row.payload['Description'] || '') ||
        'Line item';
      return {
        position: Number.isFinite(lineNo) ? lineNo : idx + 1,
        description: desc,
        quantity: parseQty(row.payload['Line Quantity'] || '1'),
        unitPriceCents: parseMoneyToCents(row.payload['Line Unit Price'] || '0'),
        code: collapseWhitespace(row.payload['Line Item Code'] || '') || undefined,
      };
    });
    lines.sort((a, b) => a.position - b.position);

    const jobNumbers = [
      ...new Set(group.flatMap((r) => extractJobNumbersFromCell(r.payload['Jobs'] || ''))),
    ];

    out.push({
      invoiceNumber,
      customerName: collapseWhitespace(head.payload['Customer'] || ''),
      reference: collapseWhitespace(head.payload['Reference'] || ''),
      description: collapseWhitespace(head.payload['Description'] || ''),
      invoiceDate: collapseWhitespace(head.payload['Invoice Date'] || '').slice(0, 10),
      dueDate: collapseWhitespace(head.payload['Due Date'] || '').slice(0, 10),
      deliveryStatus,
      status: mapTradifyInvoiceStatus({deliveryStatus, paidCents, dueCents, totalCents}),
      subtotalCents: parseMoneyToCents(head.payload['Subtotal'] || '0'),
      taxCents: parseMoneyToCents(head.payload['Tax'] || '0'),
      totalCents,
      paidCents,
      dueCents,
      jobNumbers,
      lines,
      sourceRowNumbers: group.map((r) => r.rowNumber),
    });
  }
  return out;
}

export type TimesheetRow = {
  date: string;
  staffName: string;
  jobNumber: string | null;
  startAt: Date | null;
  endAt: Date | null;
  notes: string;
  sourceRowNumber: number;
  parseOk: boolean;
};

export function mapTimesheetRows(rows: StagedRow[]): TimesheetRow[] {
  return rows.map((row) => {
    const date = collapseWhitespace(row.payload['Date'] || '').slice(0, 10);
    const staffName = collapseWhitespace(row.payload['Staff Member'] || '');
    const jobNumber = normalizeJobNumber(row.payload['Job'] || '');
    const startAt = parseTradifyAmPmToUtc(date, row.payload['Start Time'] || '');
    const endAt = parseTradifyAmPmToUtc(date, row.payload['Finish Time'] || '');
    const parseOk = Boolean(date && staffName && startAt && endAt && endAt > startAt);
    return {
      date,
      staffName,
      jobNumber,
      startAt,
      endAt,
      notes: collapseWhitespace(row.payload['Notes'] || ''),
      sourceRowNumber: row.rowNumber,
      parseOk,
    };
  });
}

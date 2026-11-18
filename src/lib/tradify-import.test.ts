import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
  assertLocalSupabaseUrl,
  buildDryRunReport,
  buildSiteAddress,
  extractStaffFromSchedule,
  formatDryRunMarkdown,
  groupQuoteRows,
  isLocalSupabaseUrl,
  mapTradifyInvoiceStatus,
  mapTradifyJobStatus,
  normalizeJobNumber,
  parseCsv,
  parseMoneyToCents,
  parseScheduleWindows,
  parseTradifyAmPmToUtc,
  rowsToObjects,
  siteMatchKey,
  splitStaffNames,
  stageRecords,
  verifyManifestFile,
} from './tradify-import/index.ts';

describe('parseCsv', () => {
  it('parses quoted commas and newlines', () => {
    const text = 'A,B\n"1,2","line1\nline2"\n3,4\n';
    const rows = parseCsv(text);
    assert.deepEqual(rows[0], ['A', 'B']);
    assert.deepEqual(rows[1], ['1,2', 'line1\nline2']);
    assert.deepEqual(rows[2], ['3', '4']);
  });

  it('unescapes doubled quotes', () => {
    const rows = parseCsv('Name\n"She said ""hi"""\n');
    assert.equal(rows[1]![0], 'She said "hi"');
  });
});

describe('normalize helpers', () => {
  it('normalises job numbers', () => {
    assert.equal(normalizeJobNumber('JB01713'), 'JB01713');
    assert.equal(normalizeJobNumber('jb 42'), 'JB00042');
    assert.equal(normalizeJobNumber(''), null);
  });

  it('builds site keys stably', () => {
    const a = siteMatchKey(
      'Acme',
      'Yard',
      buildSiteAddress({street: '1 Main St.', city: 'Perth', region: 'WA', postalCode: '6000'}),
    );
    const b = siteMatchKey(
      ' acme ',
      'yard',
      buildSiteAddress({street: '1 Main St', city: 'Perth', region: 'WA', postalCode: '6000'}),
    );
    assert.equal(a, b);
  });

  it('splits staff and schedule names', () => {
    assert.deepEqual(splitStaffNames('Neil Smith\nCooper Peberdy'), [
      'Neil Smith',
      'Cooper Peberdy',
    ]);
    assert.deepEqual(
      extractStaffFromSchedule('Cooper Peberdy - 2026-12-03 08:00 to 2026-12-03 16:00'),
      ['Cooper Peberdy'],
    );
  });

  it('parses schedule windows in Australia/Perth', () => {
    const windows = parseScheduleWindows(
      'Cooper Peberdy - 2026-12-03 08:00 to 2026-12-03 16:00',
    );
    assert.equal(windows.length, 1);
    assert.equal(windows[0]!.staffName, 'Cooper Peberdy');
    // 08:00 Perth = 00:00 UTC
    assert.equal(windows[0]!.startAt.toISOString(), '2026-12-03T00:00:00.000Z');
    assert.equal(windows[0]!.endAt.toISOString(), '2026-12-03T08:00:00.000Z');
  });

  it('maps In Progress by future schedule', () => {
    assert.equal(mapTradifyJobStatus('In Progress', true), 'in_progress');
    assert.equal(mapTradifyJobStatus('In Progress', false), 'on_hold');
    assert.equal(mapTradifyJobStatus('Complete', false), 'completed');
    assert.equal(mapTradifyJobStatus('Scheduled', true), 'scheduled');
  });

  it('parses money and invoice status', () => {
    assert.equal(parseMoneyToCents('27528.47'), 2752847);
    assert.equal(parseMoneyToCents('$1,234.56'), 123456);
    assert.equal(
      mapTradifyInvoiceStatus({
        deliveryStatus: 'Viewed',
        paidCents: 565000,
        dueCents: 0,
        totalCents: 565000,
      }),
      'paid',
    );
    assert.equal(
      mapTradifyInvoiceStatus({
        deliveryStatus: 'Unsent',
        paidCents: 0,
        dueCents: 1000,
        totalCents: 1000,
      }),
      'approved',
    );
  });

  it('parses timesheet AM/PM times', () => {
    const start = parseTradifyAmPmToUtc('2026-11-16', '7:00 AM');
    const end = parseTradifyAmPmToUtc('2026-11-16', '11:00 AM');
    assert.ok(start && end && end > start);
    assert.equal(start!.toISOString(), '2026-11-15T23:00:00.000Z');
  });
});

describe('verifyManifestFile', () => {
  it('flags sha/bytes/row mismatches', () => {
    const bytes = Buffer.from('hello');
    const check = verifyManifestFile({
      filename: 'x.csv',
      expected: {sha256: 'abc', bytes: 1, rows: 2},
      bytes,
      dataRowCount: 0,
    });
    assert.equal(check.ok, false);
    assert.ok(check.errors.length >= 3);
  });
});

describe('buildDryRunReport', () => {
  it('counts inserts, duplicates, unmatched customers, and In Progress callouts', () => {
    const customers = stageRecords({
      sourceFilename: 'customer_export.csv',
      batchId: 'tradify-test',
      records: [
        {'Customer Name': 'Acme', 'Tradify Id': 'cust-1'},
        {'Customer Name': 'Acme Dup', 'Tradify Id': 'cust-1'},
        {'Customer Name': 'No Id', 'Tradify Id': ''},
      ],
    });
    const sites = stageRecords({
      sourceFilename: 'site_export.csv',
      batchId: 'tradify-test',
      records: [
        {
          Customer: 'Acme',
          'Site Name': 'Yard',
          'Address Street': '1 Main',
          'Address City': 'Perth',
          'Address Region': 'WA',
          'Address Postal Code': '6000',
          'Address Country': 'Australia',
        },
        {
          Customer: 'Acme',
          'Site Name': 'Yard',
          'Address Street': '1 Main',
          'Address City': 'Perth',
          'Address Region': 'WA',
          'Address Postal Code': '6000',
          'Address Country': 'Australia',
        },
        {
          Customer: 'Missing Co',
          'Site Name': 'Other',
          'Address Street': '2 Side',
          'Address City': 'Perth',
          'Address Region': 'WA',
          'Address Postal Code': '6000',
          'Address Country': 'Australia',
        },
      ],
    });
    const jobs = stageRecords({
      sourceFilename: 'job_export.csv',
      batchId: 'tradify-test',
      records: [
        {
          'Job Number': 'JB00001',
          Customer: 'Acme',
          Status: 'In Progress',
          Staff: 'Neil Smith',
          Schedule: '',
        },
        {
          'Job Number': 'JB00001',
          Customer: 'Acme',
          Status: 'Scheduled',
          Staff: '',
          Schedule: '',
        },
        {
          'Job Number': 'JB00002',
          Customer: 'Ghost',
          Status: 'Unassigned',
          Staff: '',
          Schedule: 'Cooper Peberdy - 2026-12-03 08:00 to 2026-12-03 16:00',
        },
      ],
    });

    const report = buildDryRunReport({
      batchId: 'tradify-test',
      customers,
      sites,
      jobs,
      generatedAt: '2026-11-18T00:00:00.000Z',
    });

    assert.equal(report.counts.customers.insert, 1);
    assert.equal(report.counts.customers.skipDuplicateKey, 1);
    assert.equal(report.counts.customers.missingTradifyId, 1);
    assert.equal(report.counts.sites.ambiguous, 1);
    assert.equal(report.counts.sites.unmatchedCustomer, 1);
    assert.equal(report.counts.jobs.insert, 2);
    assert.equal(report.counts.jobs.skipDuplicateJobNumberInExport, 1);
    assert.equal(report.counts.jobs.unmatchedCustomer, 1);
    assert.equal(report.inProgressJobs.length, 1);
    assert.equal(report.inProgressJobs[0]!.jobNumber, 'JB00001');
    assert.equal(report.inProgressSplit.toOnHold, 1);
    assert.equal(report.inProgressSplit.toInProgress, 0);
    assert.ok(report.staffNames.includes('Neil Smith'));
    assert.ok(report.staffNames.includes('Cooper Peberdy'));
    assert.equal(report.counts.appointments.windows, 1);
    assert.match(formatDryRunMarkdown(report), /In Progress jobs/i);
    assert.match(formatDryRunMarkdown(report), /in_progress/i);
  });

  it('groups quote line rows by Quote No', () => {
    const rows = stageRecords({
      sourceFilename: 'quote_export.csv',
      batchId: 'tradify-test',
      records: [
        {
          'Quote No': 'QT00002',
          'Customer Name': 'Acme',
          Status: 'Accepted',
          Total: '100.00',
          Subtotal: '90.00',
          Tax: '10.00',
          'Line Number': '1',
          'Line Description': 'Labour',
          'Line Quantity': '1',
          'Line Unit Sell Price': '90.00',
          Jobs: 'JB00001',
        },
        {
          'Quote No': 'QT00002',
          'Customer Name': 'Acme',
          Status: 'Accepted',
          Total: '100.00',
          'Line Number': '2',
          'Line Description': 'Materials',
          'Line Quantity': '2',
          'Line Unit Sell Price': '5.00',
          Jobs: 'JB00001',
        },
      ],
    });
    const grouped = groupQuoteRows(rows);
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0]!.quoteNo, 'QT00002');
    assert.equal(grouped[0]!.status, 'accepted');
    assert.equal(grouped[0]!.lines.length, 2);
    assert.deepEqual(grouped[0]!.jobNumbers, ['JB00001']);
  });

  it('detects HQ collisions when snapshot provided', () => {
    const customers = stageRecords({
      sourceFilename: 'customer_export.csv',
      batchId: 'tradify-test',
      records: [{'Customer Name': 'Acme', 'Tradify Id': 'cust-1'}],
    });
    const jobs = stageRecords({
      sourceFilename: 'job_export.csv',
      batchId: 'tradify-test',
      records: [
        {
          'Job Number': 'JB00009',
          Customer: 'Acme',
          Status: 'Scheduled',
          Staff: 'Neil Smith',
          Schedule: '',
        },
      ],
    });
    const report = buildDryRunReport({
      batchId: 'tradify-test',
      customers,
      sites: [],
      jobs,
      hq: {
        jobNumbers: new Set([9]),
        jobTradifyIds: new Set(),
        customerTradifyIds: new Set(),
        schedulingStaffNames: new Map([['staff-1', 'Neil Smith']]),
      },
    });
    assert.equal(report.mode, 'csv+local-db');
    assert.equal(report.counts.jobs.collisionHqJobNumber, 1);
    assert.equal(report.counts.jobs.insert, 0);
    assert.deepEqual(report.matchedStaff, [
      {name: 'Neil Smith', schedulingStaffId: 'staff-1'},
    ]);
  });
});

describe('local-db URL guard', () => {
  it('allows only local Supabase API URLs', () => {
    assert.equal(isLocalSupabaseUrl('http://127.0.0.1:54321'), true);
    assert.equal(isLocalSupabaseUrl('http://localhost:54321'), true);
    assert.equal(isLocalSupabaseUrl('https://udwdurnknweavmksotii.supabase.co'), false);
    assert.throws(() => assertLocalSupabaseUrl('https://example.supabase.co'));
  });
});

describe('rowsToObjects', () => {
  it('maps header rows', () => {
    const objects = rowsToObjects([
      ['Customer Name', 'Tradify Id'],
      ['Acme', 'abc'],
    ]);
    assert.deepEqual(objects, [{'Customer Name': 'Acme', 'Tradify Id': 'abc'}]);
  });
});

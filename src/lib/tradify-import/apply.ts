/**
 * Tradify import apply — writes HQ rows via service role.
 * Idempotent via import_row_map (entity + source_key).
 * Never creates Auth users or staff_profiles.
 *
 * Performance: prefetch maps, batch inserts (chunked).
 */
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {groupInvoiceRows, groupQuoteRows, mapTimesheetRows} from './commercial.ts';
import type {DryRunReport, StagedRow} from './dry-run.ts';
import {
  buildSiteAddress,
  collapseWhitespace,
  extractStaffFromSchedule,
  mapTradifyJobStatus,
  mergeStaffNames,
  normalizeJobNumber,
  normalizeName,
  parseJobNumberInt,
  parseScheduleWindows,
  scheduleHasFutureWindow,
  siteMatchKey,
} from './normalize.ts';

export type ApplySummary = {
  batchId: string;
  created: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
};

type StaffIndex = Map<string, string>;

const CHUNK = 100;

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

function bump(summary: ApplySummary, bucket: 'created' | 'skipped', key: string, n = 1) {
  summary[bucket][key] = (summary[bucket][key] || 0) + n;
}

async function loadRowMap(db: SupabaseClient): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let from = 0;
  for (;;) {
    const {data, error} = await db
      .from('import_row_map')
      .select('entity,source_key,hq_id')
      .range(from, from + 999);
    if (error) throw new Error(`import_row_map page failed: ${error.message}`);
    const rows = data || [];
    for (const row of rows) {
      map.set(`${row.entity}::${row.source_key}`, String(row.hq_id));
    }
    if (rows.length < 1000) break;
    from += 1000;
  }
  return map;
}

function mapGet(cache: Map<string, string>, entity: string, sourceKey: string): string | null {
  return cache.get(`${entity}::${sourceKey}`) || null;
}

async function mapPutMany(
  db: SupabaseClient,
  cache: Map<string, string>,
  batchId: string,
  rows: {entity: string; sourceKey: string; hqId: string}[],
): Promise<string | null> {
  if (!rows.length) return null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const {error} = await db.from('import_row_map').upsert(
      slice.map((r) => ({
        batch_id: batchId,
        entity: r.entity,
        source_key: r.sourceKey,
        hq_id: r.hqId,
      })),
      {onConflict: 'entity,source_key'},
    );
    if (error) return error.message;
    for (const r of slice) cache.set(`${r.entity}::${r.sourceKey}`, r.hqId);
  }
  return null;
}

async function insertChunk(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
): Promise<string | null> {
  if (!rows.length) return null;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const {error} = await db.from(table).insert(slice);
    if (error) return `${table}: ${error.message}`;
  }
  return null;
}

async function ensureStaff(
  db: SupabaseClient,
  cache: Map<string, string>,
  batchId: string,
  names: string[],
  summary: ApplySummary,
): Promise<StaffIndex> {
  const index: StaffIndex = new Map();
  const {data: existing, error} = await db.from('scheduling_staff').select('id,full_name');
  if (error) throw new Error(`Failed reading scheduling_staff: ${error.message}`);
  for (const row of existing || []) {
    if (row.id && row.full_name) index.set(normalizeName(String(row.full_name)), String(row.id));
  }

  const toInsert: Record<string, unknown>[] = [];
  const mapRows: {entity: string; sourceKey: string; hqId: string}[] = [];

  for (const name of names) {
    const key = normalizeName(name);
    if (!key) continue;
    if (index.has(key)) continue;
    const mapped = mapGet(cache, 'scheduling_staff', key);
    if (mapped) {
      index.set(key, mapped);
      continue;
    }
    const id = randomUUID();
    const display = collapseWhitespace(name);
    const initials = display
      .split(/\s+/)
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase())
      .join('')
      .slice(0, 4) || 'EE';
    const palette = ['#6842C9', '#F5A54C', '#15936A', '#05BFC5', '#9962DC', '#E85D4C', '#3B82F6'];
    const avatar_color = palette[Math.abs(hashString(display)) % palette.length]!;
    toInsert.push({
      id,
      full_name: display,
      initials,
      avatar_color,
      active: true,
      auth_user_id: null,
    });
    mapRows.push({entity: 'scheduling_staff', sourceKey: key, hqId: id});
    index.set(key, id);
  }

  const insertErr = await insertChunk(db, 'scheduling_staff', toInsert);
  if (insertErr) {
    // Fall back: some names may already exist; resolve one-by-one for remainder
    summary.errors.push(insertErr);
    for (const row of toInsert) {
      const key = normalizeName(String(row.full_name));
      const {data} = await db
        .from('scheduling_staff')
        .select('id')
        .ilike('full_name', String(row.full_name))
        .limit(1)
        .maybeSingle();
      if (data?.id) {
        index.set(key, String(data.id));
        await mapPutMany(db, cache, batchId, [
          {entity: 'scheduling_staff', sourceKey: key, hqId: String(data.id)},
        ]);
        bump(summary, 'skipped', 'scheduling_staff');
      }
    }
  } else {
    const mapErr = await mapPutMany(db, cache, batchId, mapRows);
    if (mapErr) summary.errors.push(`staff map: ${mapErr}`);
    bump(summary, 'created', 'scheduling_staff', toInsert.length);
  }
  return index;
}

function jobTitle(payload: Record<string, string>, jobNumber: string): string {
  const desc = collapseWhitespace(payload['Description'] || '');
  if (desc) return desc.slice(0, 200);
  const site = collapseWhitespace(payload['Site'] || '');
  const customer = collapseWhitespace(payload['Customer'] || '');
  return ([customer, site].filter(Boolean).join(' — ') || jobNumber).slice(0, 200);
}

export async function applyTradifyBatch(args: {
  db: SupabaseClient;
  batchId: string;
  customers: StagedRow[];
  sites: StagedRow[];
  jobs: StagedRow[];
  quotes?: StagedRow[];
  invoices?: StagedRow[];
  timesheets?: StagedRow[];
  dryRunReport: DryRunReport;
  now?: Date;
  onProgress?: (message: string) => void;
}): Promise<ApplySummary> {
  const now = args.now || new Date();
  const log = args.onProgress || (() => undefined);
  const summary: ApplySummary = {
    batchId: args.batchId,
    created: {},
    skipped: {},
    errors: [],
  };

  const {error: batchError} = await args.db.from('import_batches').upsert(
    {
      batch_id: args.batchId,
      source_system: 'tradify',
      environment: 'hosted',
      applied_at: new Date().toISOString(),
      row_counts: args.dryRunReport.counts,
      checksum: {notes: args.dryRunReport.notes.slice(0, 5)},
      notes: 'tradify apply',
    },
    {onConflict: 'batch_id'},
  );
  if (batchError) {
    throw new Error(
      `import_batches upsert failed (was migration applied?): ${batchError.message}`,
    );
  }

  log('Loading import_row_map…');
  const cache = await loadRowMap(args.db);

  const staffNames = new Set<string>();
  for (const row of args.jobs) {
    for (const n of mergeStaffNames(
      row.payload['Staff'] || '',
      extractStaffFromSchedule(row.payload['Schedule'] || '').join('\n'),
    )) {
      staffNames.add(n);
    }
  }
  for (const ts of mapTimesheetRows(args.timesheets || [])) {
    if (ts.staffName) staffNames.add(ts.staffName);
  }
  log(`Ensuring scheduling_staff (${staffNames.size} names)…`);
  const staffIndex = await ensureStaff(args.db, cache, args.batchId, [...staffNames], summary);

  // Customers
  log('Customers…');
  const customerIdByTradify = new Map<string, string>();
  const customerIdByName = new Map<string, string>();
  const customerInserts: Record<string, unknown>[] = [];
  const customerMaps: {entity: string; sourceKey: string; hqId: string}[] = [];

  for (const row of args.customers) {
    const tradifyId = collapseWhitespace(row.payload['Tradify Id'] || '');
    let name = collapseWhitespace(row.payload['Customer Name'] || '');
    if (!tradifyId) continue;
    // HQ customers.name check requires length > 1
    if (name.length < 2) name = `Customer ${tradifyId}`.slice(0, 120);
    if (!name) continue;
    const existing = mapGet(cache, 'customer', tradifyId);
    if (existing) {
      customerIdByTradify.set(tradifyId, existing);
      customerIdByName.set(normalizeName(name), existing);
      bump(summary, 'skipped', 'customers');
      continue;
    }
    const id = randomUUID();
    customerInserts.push({
      id,
      name,
      email: collapseWhitespace(row.payload['Email Address'] || '') || null,
      phone:
        collapseWhitespace(row.payload['Mobile Number'] || '') ||
        collapseWhitespace(row.payload['Phone Number'] || '') ||
        null,
      company_name: name,
      tradify_id: tradifyId,
    });
    customerMaps.push({entity: 'customer', sourceKey: tradifyId, hqId: id});
    customerIdByTradify.set(tradifyId, id);
    customerIdByName.set(normalizeName(name), id);
  }
  {
    const err = await insertChunk(args.db, 'customers', customerInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, customerMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'customers', customerInserts.length);
    }
  }

  // Sites
  log('Sites…');
  const addressIdBySiteKey = new Map<string, string>();
  const addressInserts: Record<string, unknown>[] = [];
  const addressMaps: {entity: string; sourceKey: string; hqId: string}[] = [];
  for (const row of args.sites) {
    const customerName = collapseWhitespace(row.payload['Customer'] || '');
    const siteName = collapseWhitespace(row.payload['Site Name'] || '') || 'Site';
    const address = buildSiteAddress({
      street: row.payload['Address Street'],
      city: row.payload['Address City'],
      region: row.payload['Address Region'],
      postalCode: row.payload['Address Postal Code'],
      country: row.payload['Address Country'],
    });
    const key = siteMatchKey(customerName, siteName, address);
    const customerId = customerIdByName.get(normalizeName(customerName));
    if (!customerId) {
      bump(summary, 'skipped', 'addresses_unmatched_customer');
      continue;
    }
    const existing = mapGet(cache, 'address', key);
    if (existing) {
      addressIdBySiteKey.set(key, existing);
      bump(summary, 'skipped', 'addresses');
      continue;
    }
    const id = randomUUID();
    const suburb =
      collapseWhitespace(row.payload['Address City'] || '') ||
      collapseWhitespace(row.payload['Address Region'] || '') ||
      'Unknown';
    addressInserts.push({
      id,
      customer_id: customerId,
      label: siteName.slice(0, 120),
      address_line1: collapseWhitespace(row.payload['Address Street'] || '') || address || 'Address',
      suburb,
      state: collapseWhitespace(row.payload['Address Region'] || '') || 'WA',
      postcode: collapseWhitespace(row.payload['Address Postal Code'] || '') || '0000',
      is_primary: false,
    });
    addressMaps.push({entity: 'address', sourceKey: key, hqId: id});
    addressIdBySiteKey.set(key, id);
  }
  {
    const err = await insertChunk(args.db, 'customer_addresses', addressInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, addressMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'addresses', addressInserts.length);
    }
  }

  // Jobs
  log('Jobs…');
  const jobIdByNumber = new Map<string, string>();
  const jobInserts: Record<string, unknown>[] = [];
  const jobMaps: {entity: string; sourceKey: string; hqId: string}[] = [];
  type PendingAppt = {
    sourceKey: string;
    jobNumber: string;
    staffName: string;
    row: Record<string, unknown>;
  };
  const pendingAppts: PendingAppt[] = [];

  for (const row of args.jobs) {
    const jobNumber = normalizeJobNumber(row.payload['Job Number'] || '');
    if (!jobNumber) continue;
    const jobInt = parseJobNumberInt(jobNumber);
    if (jobInt == null) continue;

    let jobId = mapGet(cache, 'job', jobNumber);
    if (jobId) {
      jobIdByNumber.set(jobNumber, jobId);
      bump(summary, 'skipped', 'jobs');
    } else {
      const customerName = collapseWhitespace(row.payload['Customer'] || '');
      const customerId = customerIdByName.get(normalizeName(customerName)) || null;
      const siteName = collapseWhitespace(row.payload['Site'] || '');
      const siteAddressText = collapseWhitespace(row.payload['Job Address'] || '');
      const siteKey = siteMatchKey(customerName, siteName, siteAddressText);
      const siteAddressId = addressIdBySiteKey.get(siteKey) || null;
      const tradifyStatus = collapseWhitespace(row.payload['Status'] || '');
      const hasFuture = scheduleHasFutureWindow(row.payload['Schedule'] || '', now);
      const status = mapTradifyJobStatus(tradifyStatus, hasFuture);
      jobId = randomUUID();
      jobInserts.push({
        id: jobId,
        job_number: jobInt,
        title: jobTitle(row.payload, jobNumber),
        description: collapseWhitespace(row.payload['Description'] || '') || null,
        customer_id: customerId,
        site_address_id: siteAddressId,
        site_address_text: siteAddressText || null,
        status,
        priority: 'normal',
        source: 'tradify',
        // Keep both unique keys = Job Number (Tradify Reference is not unique across jobs).
        tradify_id: jobNumber,
        tradify_reference: jobNumber,
        tradify_status: tradifyStatus || null,
        imported_at: new Date().toISOString(),
      });
      jobMaps.push({entity: 'job', sourceKey: jobNumber, hqId: jobId});
      jobIdByNumber.set(jobNumber, jobId);
    }

    const windows = parseScheduleWindows(row.payload['Schedule'] || '', now);
    for (const w of windows) {
      const sourceKey = `${jobNumber}|${w.startAt.toISOString()}|${w.endAt.toISOString()}|${normalizeName(w.staffName)}`;
      if (mapGet(cache, 'appointment', sourceKey)) {
        bump(summary, 'skipped', 'appointments');
        continue;
      }
      const apptId = randomUUID();
      const isPast = w.endAt.getTime() <= now.getTime();
      pendingAppts.push({
        sourceKey,
        jobNumber,
        staffName: w.staffName,
        row: {
          id: apptId,
          job_id: jobId,
          starts_at: w.startAt.toISOString(),
          ends_at: w.endAt.toISOString(),
          status: isPast ? 'completed' : 'scheduled',
          notes: w.rawLine.slice(0, 500),
        },
      });
    }
  }

  {
    const err = await insertChunk(args.db, 'jobs', jobInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, jobMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'jobs', jobInserts.length);
    }
  }

  log(`Appointments (${pendingAppts.length})…`);
  const apptInserts = pendingAppts.map((p) => p.row);
  const apptMaps = pendingAppts.map((p) => ({
    entity: 'appointment',
    sourceKey: p.sourceKey,
    hqId: String(p.row.id),
  }));
  {
    const err = await insertChunk(args.db, 'job_appointments', apptInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, apptMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'appointments', apptInserts.length);
    }
  }

  const staffLinks: Record<string, unknown>[] = [];
  for (const p of pendingAppts) {
    const staffId = staffIndex.get(normalizeName(p.staffName));
    if (!staffId) continue;
    staffLinks.push({appointment_id: p.row.id, staff_id: staffId});
  }
  {
    const err = await insertChunk(args.db, 'job_appointment_staff', staffLinks);
    if (err) summary.errors.push(err);
    else bump(summary, 'created', 'appointment_staff', staffLinks.length);
  }

  // Quotes
  log('Quotes…');
  const groupedQuotes = groupQuoteRows(args.quotes || []);
  const quoteInserts: Record<string, unknown>[] = [];
  const quoteMaps: {entity: string; sourceKey: string; hqId: string}[] = [];
  const quoteItems: Record<string, unknown>[] = [];
  const jobQuoteLinks: Record<string, unknown>[] = [];

  for (const q of groupedQuotes) {
    if (mapGet(cache, 'quote', q.quoteNo)) {
      bump(summary, 'skipped', 'quotes');
      continue;
    }
    const customerId = customerIdByName.get(normalizeName(q.customerName)) || null;
    const quoteId = randomUUID();
    const isAccepted = q.status === 'accepted';
    quoteInserts.push({
      id: quoteId,
      commercial_family_id: quoteId,
      quote_number: q.quoteNo,
      tradify_quote_no: q.quoteNo,
      status: q.status,
      customer_id: customerId,
      customer_snapshot: {name: q.customerName},
      site_address_snapshot: {address: ''},
      title: (q.description || q.customerName || q.quoteNo).slice(0, 200),
      scope_of_work: q.description || '',
      customer_reference: q.reference || null,
      pricing_mode: 'detailed',
      customer_display: 'itemised',
      issue_date: q.quoteDate || null,
      expiry_date: q.expiryDate || null,
      is_commercial_current: isAccepted,
      accepted_at: isAccepted ? new Date().toISOString() : null,
    });
    quoteMaps.push({entity: 'quote', sourceKey: q.quoteNo, hqId: quoteId});
    for (const line of q.lines) {
      quoteItems.push({
        quote_id: quoteId,
        position: line.position,
        description: line.description.slice(0, 500),
        category: 'other',
        quantity: line.quantity,
        unit: 'each',
        unit_price_cents: line.unitPriceCents,
        gst_applicable: true,
      });
    }
    for (const jn of q.jobNumbers) {
      const jobId = jobIdByNumber.get(jn);
      if (!jobId) continue;
      jobQuoteLinks.push({
        job_id: jobId,
        quote_id: quoteId,
        is_primary: false,
        association_kind: 'quote',
      });
    }
  }
  {
    const err = await insertChunk(args.db, 'quotes', quoteInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, quoteMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'quotes', quoteInserts.length);
    }
  }
  {
    const err = await insertChunk(args.db, 'quote_items', quoteItems);
    if (err) summary.errors.push(err);
  }
  {
    const err = await insertChunk(args.db, 'job_quotes', jobQuoteLinks);
    if (err && !/duplicate|unique/i.test(err)) summary.errors.push(err);
  }

  // Invoices
  log('Invoices…');
  const groupedInvoices = groupInvoiceRows(args.invoices || []);
  const invoiceInserts: Record<string, unknown>[] = [];
  const invoiceMaps: {entity: string; sourceKey: string; hqId: string}[] = [];
  const invoiceItems: Record<string, unknown>[] = [];
  const invoicePayments: Record<string, unknown>[] = [];
  const invoicePaymentMaps: {entity: string; sourceKey: string; hqId: string}[] = [];

  for (const inv of groupedInvoices) {
    if (mapGet(cache, 'invoice', inv.invoiceNumber)) {
      bump(summary, 'skipped', 'invoices');
      continue;
    }
    const customerId = customerIdByName.get(normalizeName(inv.customerName)) || null;
    const jobId = inv.jobNumbers.map((jn) => jobIdByNumber.get(jn)).find(Boolean) || null;
    const invoiceId = randomUUID();
    invoiceInserts.push({
      id: invoiceId,
      invoice_number: inv.invoiceNumber,
      tradify_invoice_number: inv.invoiceNumber,
      status: inv.status,
      customer_id: customerId,
      job_id: jobId,
      customer_snapshot: {name: inv.customerName},
      site_address_snapshot: {},
      job_snapshot: {},
      title: (inv.description || inv.customerName || inv.invoiceNumber).slice(0, 200),
      description: inv.description || null,
      customer_reference: inv.reference || null,
      pricing_mode: 'detailed',
      customer_display: 'itemised',
      issue_date: inv.invoiceDate || null,
      due_date: inv.dueDate || null,
      sent_at:
        inv.status === 'sent' || inv.status === 'paid' || inv.status === 'part_paid'
          ? new Date().toISOString()
          : null,
    });
    invoiceMaps.push({entity: 'invoice', sourceKey: inv.invoiceNumber, hqId: invoiceId});
    for (const line of inv.lines) {
      invoiceItems.push({
        invoice_id: invoiceId,
        position: line.position,
        description: line.description.slice(0, 500),
        category: 'other',
        quantity: line.quantity,
        unit: 'each',
        unit_price_cents: line.unitPriceCents,
        gst_applicable: true,
      });
    }
    if (inv.paidCents > 0) {
      const payId = randomUUID();
      invoicePayments.push({
        id: payId,
        invoice_id: invoiceId,
        amount_cents: inv.paidCents,
        payment_date: inv.invoiceDate || new Date().toISOString().slice(0, 10),
        payment_method: 'other',
        reference: 'Tradify import paid amount',
        notes: 'Imported from Tradify Paid column',
      });
      invoicePaymentMaps.push({
        entity: 'invoice_payment',
        sourceKey: `${inv.invoiceNumber}:paid`,
        hqId: payId,
      });
    }
  }
  {
    const err = await insertChunk(args.db, 'invoices', invoiceInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, invoiceMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'invoices', invoiceInserts.length);
    }
  }
  {
    const err = await insertChunk(args.db, 'invoice_items', invoiceItems);
    if (err) summary.errors.push(err);
  }
  {
    const err = await insertChunk(args.db, 'invoice_payments', invoicePayments);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, invoicePaymentMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'invoice_payments', invoicePayments.length);
    }
  }

  // Timesheets
  log('Timesheets…');
  const timeInserts: Record<string, unknown>[] = [];
  const timeMaps: {entity: string; sourceKey: string; hqId: string}[] = [];
  for (const ts of mapTimesheetRows(args.timesheets || [])) {
    if (!ts.parseOk || !ts.startAt || !ts.endAt) {
      bump(summary, 'skipped', 'timesheets_parse');
      continue;
    }
    const sourceKey = [
      ts.date,
      normalizeName(ts.staffName),
      ts.jobNumber || '',
      ts.startAt.toISOString(),
      ts.endAt.toISOString(),
    ].join('|');
    if (mapGet(cache, 'time_entry', sourceKey)) {
      bump(summary, 'skipped', 'timesheets');
      continue;
    }
    const staffId = staffIndex.get(normalizeName(ts.staffName));
    if (!staffId) {
      bump(summary, 'skipped', 'timesheets_staff');
      continue;
    }
    const jobId = ts.jobNumber ? jobIdByNumber.get(ts.jobNumber) : null;
    if (!jobId) {
      bump(summary, 'skipped', 'timesheets_job');
      continue;
    }
    const workedMinutes = Math.max(
      0,
      Math.round((ts.endAt.getTime() - ts.startAt.getTime()) / 60000),
    );
    const id = randomUUID();
    timeInserts.push({
      id,
      job_id: jobId,
      staff_id: staffId,
      technician_user_id: null,
      started_at: ts.startAt.toISOString(),
      ended_at: ts.endAt.toISOString(),
      break_minutes: 0,
      worked_minutes: workedMinutes,
      billable_minutes: workedMinutes,
      status: 'submitted',
      entry_source: 'import',
      note: ts.notes || 'Imported from Tradify timesheet export',
    });
    timeMaps.push({entity: 'time_entry', sourceKey, hqId: id});
  }
  {
    const err = await insertChunk(args.db, 'job_time_entries', timeInserts);
    if (err) summary.errors.push(err);
    else {
      const mapErr = await mapPutMany(args.db, cache, args.batchId, timeMaps);
      if (mapErr) summary.errors.push(mapErr);
      bump(summary, 'created', 'timesheets', timeInserts.length);
    }
  }

  log('Apply finished.');
  return summary;
}

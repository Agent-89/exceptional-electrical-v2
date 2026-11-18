/**
 * Tradify import apply — writes HQ rows via service role.
 * Idempotent via import_row_map (entity + source_key).
 * Never creates Auth users or staff_profiles.
 */
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {groupInvoiceRows, groupQuoteRows, mapTimesheetRows} from './commercial.ts';
import type {DryRunReport, StagedRow} from './dry-run.ts';
import {
  buildSiteAddress,
  collapseWhitespace,
  mapTradifyJobStatus,
  mergeStaffNames,
  normalizeJobNumber,
  normalizeName,
  parseJobNumberInt,
  parseScheduleWindows,
  scheduleHasFutureWindow,
  siteMatchKey,
  extractStaffFromSchedule,
} from './normalize.ts';

export type ApplySummary = {
  batchId: string;
  created: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
};

type StaffIndex = Map<string, string>; // normalized name → scheduling_staff.id

async function mapGet(
  db: SupabaseClient,
  entity: string,
  sourceKey: string,
): Promise<string | null> {
  const {data, error} = await db
    .from('import_row_map')
    .select('hq_id')
    .eq('entity', entity)
    .eq('source_key', sourceKey)
    .maybeSingle();
  if (error) throw new Error(`import_row_map read failed: ${error.message}`);
  return data?.hq_id ? String(data.hq_id) : null;
}

async function mapPut(
  db: SupabaseClient,
  batchId: string,
  entity: string,
  sourceKey: string,
  hqId: string,
): Promise<void> {
  const {error} = await db.from('import_row_map').upsert(
    {
      batch_id: batchId,
      entity,
      source_key: sourceKey,
      hq_id: hqId,
    },
    {onConflict: 'entity,source_key'},
  );
  if (error) throw new Error(`import_row_map write failed (${entity}/${sourceKey}): ${error.message}`);
}

async function ensureStaff(
  db: SupabaseClient,
  batchId: string,
  names: string[],
  summary: ApplySummary,
): Promise<StaffIndex> {
  const index: StaffIndex = new Map();
  const {data: existing, error} = await db
    .from('scheduling_staff')
    .select('id,full_name,active');
  if (error) throw new Error(`Failed reading scheduling_staff: ${error.message}`);
  for (const row of existing || []) {
    if (row.id && row.full_name) {
      index.set(normalizeName(String(row.full_name)), String(row.id));
    }
  }

  for (const name of names) {
    const key = normalizeName(name);
    if (!key) continue;
    if (index.has(key)) continue;
    const mapped = await mapGet(db, 'scheduling_staff', key);
    if (mapped) {
      index.set(key, mapped);
      continue;
    }
    const id = randomUUID();
    const {error: insertError} = await db.from('scheduling_staff').insert({
      id,
      full_name: collapseWhitespace(name),
      active: true,
      auth_user_id: null,
    });
    if (insertError) {
      // Retry read in case of race / unique name
      const {data: again} = await db
        .from('scheduling_staff')
        .select('id,full_name')
        .ilike('full_name', collapseWhitespace(name))
        .limit(1)
        .maybeSingle();
      if (again?.id) {
        index.set(key, String(again.id));
        await mapPut(db, batchId, 'scheduling_staff', key, String(again.id));
        summary.skipped.scheduling_staff = (summary.skipped.scheduling_staff || 0) + 1;
        continue;
      }
      summary.errors.push(`scheduling_staff insert ${name}: ${insertError.message}`);
      continue;
    }
    await mapPut(db, batchId, 'scheduling_staff', key, id);
    index.set(key, id);
    summary.created.scheduling_staff = (summary.created.scheduling_staff || 0) + 1;
  }
  return index;
}

function jobTitle(payload: Record<string, string>, jobNumber: string): string {
  const desc = collapseWhitespace(payload['Description'] || '');
  if (desc) return desc.slice(0, 200);
  const site = collapseWhitespace(payload['Site'] || '');
  const customer = collapseWhitespace(payload['Customer'] || '');
  const title = [customer, site].filter(Boolean).join(' — ') || jobNumber;
  return title.slice(0, 200);
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
}): Promise<ApplySummary> {
  const now = args.now || new Date();
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

  // Collect all staff names
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
  const staffIndex = await ensureStaff(args.db, args.batchId, [...staffNames], summary);

  // Customers
  const customerIdByTradify = new Map<string, string>();
  const customerIdByName = new Map<string, string>();
  for (const row of args.customers) {
    const tradifyId = collapseWhitespace(row.payload['Tradify Id'] || '');
    const name = collapseWhitespace(row.payload['Customer Name'] || '');
    if (!tradifyId || !name) continue;
    const existing = await mapGet(args.db, 'customer', tradifyId);
    if (existing) {
      customerIdByTradify.set(tradifyId, existing);
      customerIdByName.set(normalizeName(name), existing);
      summary.skipped.customers = (summary.skipped.customers || 0) + 1;
      continue;
    }
    const id = randomUUID();
    const email = collapseWhitespace(row.payload['Email Address'] || '') || null;
    const phone =
      collapseWhitespace(row.payload['Mobile Number'] || '') ||
      collapseWhitespace(row.payload['Phone Number'] || '') ||
      null;
    const {error} = await args.db.from('customers').insert({
      id,
      name,
      email,
      phone,
      company_name: name,
      tradify_id: tradifyId,
    });
    if (error) {
      // Unique tradify_id race → fetch
      const {data: found} = await args.db
        .from('customers')
        .select('id,name')
        .eq('tradify_id', tradifyId)
        .maybeSingle();
      if (found?.id) {
        customerIdByTradify.set(tradifyId, String(found.id));
        customerIdByName.set(normalizeName(name), String(found.id));
        await mapPut(args.db, args.batchId, 'customer', tradifyId, String(found.id));
        summary.skipped.customers = (summary.skipped.customers || 0) + 1;
        continue;
      }
      summary.errors.push(`customer ${tradifyId}: ${error.message}`);
      continue;
    }
    await mapPut(args.db, args.batchId, 'customer', tradifyId, id);
    customerIdByTradify.set(tradifyId, id);
    customerIdByName.set(normalizeName(name), id);
    summary.created.customers = (summary.created.customers || 0) + 1;
  }

  // Sites / addresses
  const addressIdBySiteKey = new Map<string, string>();
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
      summary.skipped.addresses_unmatched_customer =
        (summary.skipped.addresses_unmatched_customer || 0) + 1;
      continue;
    }
    const existing = await mapGet(args.db, 'address', key);
    if (existing) {
      addressIdBySiteKey.set(key, existing);
      summary.skipped.addresses = (summary.skipped.addresses || 0) + 1;
      continue;
    }
    const id = randomUUID();
    const {error} = await args.db.from('customer_addresses').insert({
      id,
      customer_id: customerId,
      label: siteName.slice(0, 120),
      address_line1: collapseWhitespace(row.payload['Address Street'] || '') || address || 'Address',
      suburb: collapseWhitespace(row.payload['Address City'] || '') || null,
      state: collapseWhitespace(row.payload['Address Region'] || '') || null,
      postcode: collapseWhitespace(row.payload['Address Postal Code'] || '') || null,
      is_primary: false,
      notes: null,
    });
    if (error) {
      summary.errors.push(`address ${key}: ${error.message}`);
      continue;
    }
    await mapPut(args.db, args.batchId, 'address', key, id);
    addressIdBySiteKey.set(key, id);
    summary.created.addresses = (summary.created.addresses || 0) + 1;
  }

  // Jobs + appointments
  const jobIdByNumber = new Map<string, string>();
  for (const row of args.jobs) {
    const jobNumber = normalizeJobNumber(row.payload['Job Number'] || '');
    if (!jobNumber) continue;
    const jobInt = parseJobNumberInt(jobNumber);
    if (jobInt == null) continue;

    const existing = await mapGet(args.db, 'job', jobNumber);
    let jobId = existing;
    if (jobId) {
      jobIdByNumber.set(jobNumber, jobId);
      summary.skipped.jobs = (summary.skipped.jobs || 0) + 1;
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
      const {error} = await args.db.from('jobs').insert({
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
        tradify_id: jobNumber,
        tradify_reference: collapseWhitespace(row.payload['Reference'] || '') || jobNumber,
        tradify_status: tradifyStatus || null,
        imported_at: new Date().toISOString(),
      });
      if (error) {
        // Collision with existing HQ job_number — do not overwrite
        summary.errors.push(`job ${jobNumber}: ${error.message}`);
        summary.skipped.jobs_collision = (summary.skipped.jobs_collision || 0) + 1;
        continue;
      }
      await mapPut(args.db, args.batchId, 'job', jobNumber, jobId);
      jobIdByNumber.set(jobNumber, jobId);
      summary.created.jobs = (summary.created.jobs || 0) + 1;

      // Optional job notes
      const notes = collapseWhitespace(row.payload['Notes'] || '');
      if (notes) {
        // job_notes requires author_id (staff_profiles) — skip if no Auth; store on description already.
      }
    }

    // Appointments from Schedule
    const windows = parseScheduleWindows(row.payload['Schedule'] || '', now);
    for (const w of windows) {
      const sourceKey = `${jobNumber}|${w.startAt.toISOString()}|${w.endAt.toISOString()}|${normalizeName(w.staffName)}`;
      const existingAppt = await mapGet(args.db, 'appointment', sourceKey);
      if (existingAppt) {
        summary.skipped.appointments = (summary.skipped.appointments || 0) + 1;
        continue;
      }
      if (!jobId) continue;
      const apptId = randomUUID();
      const isPast = w.endAt.getTime() <= now.getTime();
      const {error: apptError} = await args.db.from('job_appointments').insert({
        id: apptId,
        job_id: jobId,
        starts_at: w.startAt.toISOString(),
        ends_at: w.endAt.toISOString(),
        status: isPast ? 'completed' : 'scheduled',
        notes: w.rawLine.slice(0, 500),
      });
      if (apptError) {
        summary.errors.push(`appointment ${sourceKey}: ${apptError.message}`);
        continue;
      }
      await mapPut(args.db, args.batchId, 'appointment', sourceKey, apptId);
      summary.created.appointments = (summary.created.appointments || 0) + 1;

      const staffId = staffIndex.get(normalizeName(w.staffName));
      if (staffId) {
        const {error: linkError} = await args.db.from('job_appointment_staff').insert({
          appointment_id: apptId,
          staff_id: staffId,
        });
        if (linkError) {
          summary.errors.push(`appointment staff ${sourceKey}: ${linkError.message}`);
        }
      }
    }

    // Crew linkage for visits is via job_appointment_staff → scheduling_staff only.
    // Do not write job_assignments here (historical FK drift vs scheduling_staff).
  }

  // Quotes
  const groupedQuotes = groupQuoteRows(args.quotes || []);
  for (const q of groupedQuotes) {
    const existing = await mapGet(args.db, 'quote', q.quoteNo);
    if (existing) {
      summary.skipped.quotes = (summary.skipped.quotes || 0) + 1;
      continue;
    }
    const customerId = customerIdByName.get(normalizeName(q.customerName)) || null;
    const quoteId = randomUUID();
    const customerSnapshot = {name: q.customerName};
    const isAccepted = q.status === 'accepted';
    const {error} = await args.db.from('quotes').insert({
      id: quoteId,
      commercial_family_id: quoteId,
      quote_number: q.quoteNo,
      tradify_quote_no: q.quoteNo,
      status: q.status,
      customer_id: customerId,
      customer_snapshot: customerSnapshot,
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
    if (error) {
      summary.errors.push(`quote ${q.quoteNo}: ${error.message}`);
      continue;
    }
    if (q.lines.length) {
      const {error: lineError} = await args.db.from('quote_items').insert(
        q.lines.map((line) => ({
          quote_id: quoteId,
          position: line.position,
          description: line.description.slice(0, 500),
          category: 'other',
          quantity: line.quantity,
          unit: 'each',
          unit_price_cents: line.unitPriceCents,
          gst_applicable: true,
        })),
      );
      if (lineError) summary.errors.push(`quote lines ${q.quoteNo}: ${lineError.message}`);
    }
    for (const jn of q.jobNumbers) {
      const jobId = jobIdByNumber.get(jn);
      if (!jobId) continue;
      await args.db.from('job_quotes').upsert(
        {
          job_id: jobId,
          quote_id: quoteId,
          is_primary: false,
          association_kind: 'quote',
        },
        {onConflict: 'job_id,quote_id', ignoreDuplicates: true},
      );
    }
    await mapPut(args.db, args.batchId, 'quote', q.quoteNo, quoteId);
    summary.created.quotes = (summary.created.quotes || 0) + 1;
  }

  // Invoices
  const groupedInvoices = groupInvoiceRows(args.invoices || []);
  for (const inv of groupedInvoices) {
    const existing = await mapGet(args.db, 'invoice', inv.invoiceNumber);
    if (existing) {
      summary.skipped.invoices = (summary.skipped.invoices || 0) + 1;
      continue;
    }
    const customerId = customerIdByName.get(normalizeName(inv.customerName)) || null;
    const jobId = inv.jobNumbers.map((jn) => jobIdByNumber.get(jn)).find(Boolean) || null;
    const invoiceId = randomUUID();
    const {error} = await args.db.from('invoices').insert({
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
    if (error) {
      summary.errors.push(`invoice ${inv.invoiceNumber}: ${error.message}`);
      continue;
    }
    if (inv.lines.length) {
      const {error: lineError} = await args.db.from('invoice_items').insert(
        inv.lines.map((line) => ({
          invoice_id: invoiceId,
          position: line.position,
          description: line.description.slice(0, 500),
          category: 'other',
          quantity: line.quantity,
          unit: 'each',
          unit_price_cents: line.unitPriceCents,
          gst_applicable: true,
        })),
      );
      if (lineError) {
        summary.errors.push(`invoice lines ${inv.invoiceNumber}: ${lineError.message}`);
      }
    }
    if (inv.paidCents > 0) {
      const payId = randomUUID();
      const {error: payError} = await args.db.from('invoice_payments').insert({
        id: payId,
        invoice_id: invoiceId,
        amount_cents: inv.paidCents,
        payment_date: inv.invoiceDate || new Date().toISOString().slice(0, 10),
        payment_method: 'other',
        reference: 'Tradify import paid amount',
        notes: 'Imported from Tradify Paid column',
      });
      if (payError) {
        summary.errors.push(`invoice payment ${inv.invoiceNumber}: ${payError.message}`);
      } else {
        await mapPut(args.db, args.batchId, 'invoice_payment', `${inv.invoiceNumber}:paid`, payId);
        summary.created.invoice_payments = (summary.created.invoice_payments || 0) + 1;
      }
    }
    await mapPut(args.db, args.batchId, 'invoice', inv.invoiceNumber, invoiceId);
    summary.created.invoices = (summary.created.invoices || 0) + 1;
  }

  // Timesheets (crew-only)
  for (const ts of mapTimesheetRows(args.timesheets || [])) {
    if (!ts.parseOk || !ts.startAt || !ts.endAt) {
      summary.skipped.timesheets_parse = (summary.skipped.timesheets_parse || 0) + 1;
      continue;
    }
    const sourceKey = [
      ts.date,
      normalizeName(ts.staffName),
      ts.jobNumber || '',
      ts.startAt.toISOString(),
      ts.endAt.toISOString(),
    ].join('|');
    const existing = await mapGet(args.db, 'time_entry', sourceKey);
    if (existing) {
      summary.skipped.timesheets = (summary.skipped.timesheets || 0) + 1;
      continue;
    }
    const staffId = staffIndex.get(normalizeName(ts.staffName));
    if (!staffId) {
      summary.skipped.timesheets_staff = (summary.skipped.timesheets_staff || 0) + 1;
      continue;
    }
    const jobId = ts.jobNumber ? jobIdByNumber.get(ts.jobNumber) : null;
    if (!jobId) {
      summary.skipped.timesheets_job = (summary.skipped.timesheets_job || 0) + 1;
      continue;
    }
    const workedMinutes = Math.max(
      0,
      Math.round((ts.endAt.getTime() - ts.startAt.getTime()) / 60000),
    );
    const id = randomUUID();
    const {error} = await args.db.from('job_time_entries').insert({
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
    if (error) {
      summary.errors.push(`timesheet ${sourceKey}: ${error.message}`);
      continue;
    }
    await mapPut(args.db, args.batchId, 'time_entry', sourceKey, id);
    summary.created.timesheets = (summary.created.timesheets || 0) + 1;
  }

  return summary;
}

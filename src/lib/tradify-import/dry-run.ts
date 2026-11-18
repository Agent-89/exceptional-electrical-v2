import {groupInvoiceRows, groupQuoteRows, mapTimesheetRows} from './commercial.ts';
import {
  buildSiteAddress,
  extractStaffFromSchedule,
  mergeStaffNames,
  normalizeJobNumber,
  normalizeName,
  parseJobNumberInt,
  siteMatchKey,
} from './normalize.ts';
import {
  buildInProgressSplit,
  collectAppointmentCandidates,
  countStaffOverlaps,
  type InProgressSplit,
} from './status-split.ts';

export type StagedRow = {
  sourceFilename: string;
  rowNumber: number;
  checksum: string;
  batchId: string;
  payload: Record<string, string>;
};

export type HqSnapshot = {
  /** Existing HQ job_number integers. */
  jobNumbers: ReadonlySet<number>;
  /** Existing jobs.tradify_id values. */
  jobTradifyIds: ReadonlySet<string>;
  /** Existing customer external/tradify ids if present. */
  customerTradifyIds: ReadonlySet<string>;
  /** Existing scheduling_staff full_name values (display). */
  schedulingStaffNames: ReadonlyMap<string, string>;
};

export type DryRunCounts = {
  customers: {source: number; insert: number; skipDuplicateKey: number; missingTradifyId: number};
  sites: {
    source: number;
    insert: number;
    ambiguous: number;
    duplicateKey: number;
    unmatchedCustomer: number;
  };
  jobs: {
    source: number;
    insert: number;
    skipMissingJobNumber: number;
    skipDuplicateJobNumberInExport: number;
    collisionHqJobNumber: number;
    collisionHqTradifyId: number;
    unmatchedCustomer: number;
  };
  staff: {
    uniqueNames: number;
    matchedSchedulingStaff: number;
    unmatchedNames: number;
    willCreateSchedulingStaff: number;
  };
  appointments: {
    jobsWithSchedule: number;
    parseFailures: number;
    /** Raw Tradify Schedule lines (per electrician). */
    scheduleLines: number;
    /** HQ visits after grouping same job+start+end. */
    visits: number;
    /** Alias of visits (kept for older report consumers). */
    windows: number;
    multiCrewVisits: number;
    future: number;
    past: number;
    staffOverlapPairs: number;
  };
  quotes: {sourceLines: number; uniqueQuotes: number; unmatchedCustomer: number};
  invoices: {sourceLines: number; uniqueInvoices: number; unmatchedCustomer: number};
  timesheets: {
    source: number;
    parseOk: number;
    unmatchedJob: number;
    unmatchedStaff: number;
  };
};

export type DryRunReport = {
  batchId: string;
  generatedAt: string;
  mode: 'csv-only' | 'csv+local-db';
  counts: DryRunCounts;
  statusInventory: Record<string, number>;
  inProgressSplit: InProgressSplit;
  inProgressJobs: {jobNumber: string; customer: string; status: string}[];
  unmatchedCustomersForJobs: string[];
  unmatchedCustomersForSites: string[];
  duplicateCustomerTradifyIds: string[];
  duplicateJobNumbersInExport: string[];
  ambiguousSites: {
    key: string;
    customer: string;
    siteName: string;
    rowNumbers: number[];
  }[];
  staffNames: string[];
  unmatchedStaffNames: string[];
  matchedStaff: {name: string; schedulingStaffId: string}[];
  hqCollisions: {
    jobNumbers: string[];
    tradifyIds: string[];
  };
  notes: string[];
};

function emptyCounts(): DryRunCounts {
  return {
    customers: {source: 0, insert: 0, skipDuplicateKey: 0, missingTradifyId: 0},
    sites: {
      source: 0,
      insert: 0,
      ambiguous: 0,
      duplicateKey: 0,
      unmatchedCustomer: 0,
    },
    jobs: {
      source: 0,
      insert: 0,
      skipMissingJobNumber: 0,
      skipDuplicateJobNumberInExport: 0,
      collisionHqJobNumber: 0,
      collisionHqTradifyId: 0,
      unmatchedCustomer: 0,
    },
    staff: {
      uniqueNames: 0,
      matchedSchedulingStaff: 0,
      unmatchedNames: 0,
      willCreateSchedulingStaff: 0,
    },
    appointments: {
      jobsWithSchedule: 0,
      parseFailures: 0,
      scheduleLines: 0,
      visits: 0,
      windows: 0,
      multiCrewVisits: 0,
      future: 0,
      past: 0,
      staffOverlapPairs: 0,
    },
    quotes: {sourceLines: 0, uniqueQuotes: 0, unmatchedCustomer: 0},
    invoices: {sourceLines: 0, uniqueInvoices: 0, unmatchedCustomer: 0},
    timesheets: {source: 0, parseOk: 0, unmatchedJob: 0, unmatchedStaff: 0},
  };
}

export function buildDryRunReport(args: {
  batchId: string;
  customers: StagedRow[];
  sites: StagedRow[];
  jobs: StagedRow[];
  quotes?: StagedRow[];
  invoices?: StagedRow[];
  timesheets?: StagedRow[];
  hq?: HqSnapshot | null;
  generatedAt?: string;
  now?: Date;
}): DryRunReport {
  const now = args.now || new Date();
  const counts = emptyCounts();
  const customerByTradifyId = new Map<string, StagedRow>();
  const customerByName = new Map<string, string[]>();
  const duplicateCustomerTradifyIds: string[] = [];

  counts.customers.source = args.customers.length;
  for (const row of args.customers) {
    const tradifyId = (row.payload['Tradify Id'] || '').trim();
    const name = (row.payload['Customer Name'] || '').trim();
    if (!tradifyId) {
      counts.customers.missingTradifyId += 1;
      continue;
    }
    if (customerByTradifyId.has(tradifyId)) {
      counts.customers.skipDuplicateKey += 1;
      duplicateCustomerTradifyIds.push(tradifyId);
      continue;
    }
    customerByTradifyId.set(tradifyId, row);
    counts.customers.insert += 1;
    const nKey = normalizeName(name);
    if (nKey) {
      const list = customerByName.get(nKey) || [];
      list.push(tradifyId);
      customerByName.set(nKey, list);
    }
  }

  const customerNameSet = new Set(
    [...customerByTradifyId.values()].map((r) => normalizeName(r.payload['Customer Name'] || '')),
  );

  const siteKeyRows = new Map<string, number[]>();
  const unmatchedCustomersForSitesSet = new Set<string>();
  counts.sites.source = args.sites.length;

  for (const row of args.sites) {
    const customer = (row.payload['Customer'] || '').trim();
    const siteName = (row.payload['Site Name'] || '').trim();
    const address = buildSiteAddress({
      street: row.payload['Address Street'],
      city: row.payload['Address City'],
      region: row.payload['Address Region'],
      postalCode: row.payload['Address Postal Code'],
      country: row.payload['Address Country'],
    });
    const key = siteMatchKey(customer, siteName, address);
    const list = siteKeyRows.get(key) || [];
    list.push(row.rowNumber);
    siteKeyRows.set(key, list);

    if (!customerNameSet.has(normalizeName(customer))) {
      counts.sites.unmatchedCustomer += 1;
      unmatchedCustomersForSitesSet.add(customer || '(blank)');
    }
  }

  const ambiguousSites: DryRunReport['ambiguousSites'] = [];
  let uniqueSiteKeys = 0;
  for (const [key, rowNumbers] of siteKeyRows) {
    if (rowNumbers.length > 1) {
      counts.sites.duplicateKey += rowNumbers.length - 1;
      counts.sites.ambiguous += 1;
      const sample = args.sites.find((s) => s.rowNumber === rowNumbers[0]!);
      ambiguousSites.push({
        key,
        customer: sample?.payload['Customer'] || '',
        siteName: sample?.payload['Site Name'] || '',
        rowNumbers,
      });
    } else {
      uniqueSiteKeys += 1;
    }
  }
  // Inserts = unique keys that aren't flagged only as duplicates... unique keys include ambiguous groups as 1 review item.
  // Contract: flag duplicates/ambiguous for manual review; count insert as unique keys.
  counts.sites.insert = uniqueSiteKeys + ambiguousSites.length;

  const statusInventory: Record<string, number> = {};
  const jobNumbersSeen = new Map<string, number>();
  const duplicateJobNumbersInExport: string[] = [];
  const unmatchedCustomersForJobsSet = new Set<string>();
  const inProgressJobs: DryRunReport['inProgressJobs'] = [];
  const hqJobNumberCollisions: string[] = [];
  const hqTradifyIdCollisions: string[] = [];
  const staffNameSet = new Map<string, string>();

  counts.jobs.source = args.jobs.length;

  for (const row of args.jobs) {
    const customer = (row.payload['Customer'] || '').trim();
    const status = (row.payload['Status'] || '').trim() || '(blank)';
    statusInventory[status] = (statusInventory[status] || 0) + 1;

    const staff = mergeStaffNames(
      row.payload['Staff'] || '',
      extractStaffFromSchedule(row.payload['Schedule'] || '').join('\n'),
    );
    for (const name of staff) {
      const key = normalizeName(name);
      if (!staffNameSet.has(key)) staffNameSet.set(key, name);
    }

    const jobNumber = normalizeJobNumber(row.payload['Job Number'] || '');
    if (!jobNumber) {
      counts.jobs.skipMissingJobNumber += 1;
      continue;
    }

    const prev = jobNumbersSeen.get(jobNumber);
    if (prev != null) {
      counts.jobs.skipDuplicateJobNumberInExport += 1;
      if (!duplicateJobNumbersInExport.includes(jobNumber)) {
        duplicateJobNumbersInExport.push(jobNumber);
      }
      continue;
    }
    jobNumbersSeen.set(jobNumber, row.rowNumber);

    if (!customerNameSet.has(normalizeName(customer))) {
      counts.jobs.unmatchedCustomer += 1;
      unmatchedCustomersForJobsSet.add(customer || '(blank)');
    }

    if (/^in progress$/i.test(status)) {
      inProgressJobs.push({jobNumber, customer, status});
    }

    let collision = false;
    const jobInt = parseJobNumberInt(jobNumber);
    if (args.hq && jobInt != null && args.hq.jobNumbers.has(jobInt)) {
      counts.jobs.collisionHqJobNumber += 1;
      hqJobNumberCollisions.push(jobNumber);
      collision = true;
    }
    // Tradify export has no stable job tradify UUID column; job number is the import key.
    // If HQ already has tradify_reference equal to job number, treat as collision when snapshot provided.
    if (args.hq && args.hq.jobTradifyIds.has(jobNumber)) {
      counts.jobs.collisionHqTradifyId += 1;
      hqTradifyIdCollisions.push(jobNumber);
      collision = true;
    }

    if (!collision) counts.jobs.insert += 1;
  }

  const staffNames = [...staffNameSet.values()].sort((a, b) =>
    a.localeCompare(b, 'en', {sensitivity: 'base'}),
  );
  const matchedStaff: DryRunReport['matchedStaff'] = [];
  const unmatchedStaffNames: string[] = [];
  if (args.hq) {
    const byNorm = new Map<string, string>();
    for (const [id, name] of args.hq.schedulingStaffNames) {
      byNorm.set(normalizeName(name), id);
    }
    for (const name of staffNames) {
      const id = byNorm.get(normalizeName(name));
      if (id) matchedStaff.push({name, schedulingStaffId: id});
      else unmatchedStaffNames.push(name);
    }
  } else {
    unmatchedStaffNames.push(...staffNames);
  }
  counts.staff.uniqueNames = staffNames.length;
  counts.staff.matchedSchedulingStaff = matchedStaff.length;
  counts.staff.unmatchedNames = unmatchedStaffNames.length;
  // Apply will create missing scheduling_staff rows (no Auth) for unmatched names.
  counts.staff.willCreateSchedulingStaff = unmatchedStaffNames.length;

  const appt = collectAppointmentCandidates(args.jobs, now);
  counts.appointments = {
    jobsWithSchedule: appt.jobsWithSchedule,
    parseFailures: appt.parseFailures,
    scheduleLines: appt.scheduleLines,
    visits: appt.visits,
    windows: appt.visits,
    multiCrewVisits: appt.multiCrewVisits,
    future: appt.futureCount,
    past: appt.pastCount,
    staffOverlapPairs: countStaffOverlaps(appt.candidates),
  };

  const inProgressSplit = buildInProgressSplit(args.jobs, now);

  const quoteRows = args.quotes || [];
  const groupedQuotes = groupQuoteRows(quoteRows);
  counts.quotes.sourceLines = quoteRows.length;
  counts.quotes.uniqueQuotes = groupedQuotes.length;
  for (const q of groupedQuotes) {
    if (!customerNameSet.has(normalizeName(q.customerName))) {
      counts.quotes.unmatchedCustomer += 1;
    }
  }

  const invoiceRows = args.invoices || [];
  const groupedInvoices = groupInvoiceRows(invoiceRows);
  counts.invoices.sourceLines = invoiceRows.length;
  counts.invoices.uniqueInvoices = groupedInvoices.length;
  for (const inv of groupedInvoices) {
    if (!customerNameSet.has(normalizeName(inv.customerName))) {
      counts.invoices.unmatchedCustomer += 1;
    }
  }

  const timesheetRows = args.timesheets || [];
  const mappedTs = mapTimesheetRows(timesheetRows);
  counts.timesheets.source = mappedTs.length;
  const jobNumberSet = new Set(jobNumbersSeen.keys());
  for (const ts of mappedTs) {
    if (ts.parseOk) counts.timesheets.parseOk += 1;
    if (ts.jobNumber && !jobNumberSet.has(ts.jobNumber)) {
      counts.timesheets.unmatchedJob += 1;
    }
    if (ts.staffName) {
      const key = normalizeName(ts.staffName);
      if (!staffNameSet.has(key)) {
        staffNameSet.set(key, ts.staffName);
      }
      if (args.hq) {
        const byNorm = new Map<string, string>();
        for (const [id, name] of args.hq.schedulingStaffNames) {
          byNorm.set(normalizeName(name), id);
        }
        if (!byNorm.has(key) && !staffNames.some((n) => normalizeName(n) === key)) {
          counts.timesheets.unmatchedStaff += 1;
        }
      }
    }
  }
  // Refresh staff list after timesheet names
  const staffNamesFinal = [...staffNameSet.values()].sort((a, b) =>
    a.localeCompare(b, 'en', {sensitivity: 'base'}),
  );
  // Recompute unmatched if timesheets added names
  if (staffNamesFinal.length !== staffNames.length) {
    unmatchedStaffNames.length = 0;
    matchedStaff.length = 0;
    if (args.hq) {
      const byNorm = new Map<string, string>();
      for (const [id, name] of args.hq.schedulingStaffNames) {
        byNorm.set(normalizeName(name), id);
      }
      for (const name of staffNamesFinal) {
        const id = byNorm.get(normalizeName(name));
        if (id) matchedStaff.push({name, schedulingStaffId: id});
        else unmatchedStaffNames.push(name);
      }
    } else {
      unmatchedStaffNames.push(...staffNamesFinal);
    }
    counts.staff.uniqueNames = staffNamesFinal.length;
    counts.staff.matchedSchedulingStaff = matchedStaff.length;
    counts.staff.unmatchedNames = unmatchedStaffNames.length;
    counts.staff.willCreateSchedulingStaff = unmatchedStaffNames.length;
  }

  const notes = [
    'Dry-run only: no database writes were performed.',
    'Customer natural key: Tradify Id. Do not merge solely by name.',
    'Sites keyed by (customer, normalised site name, normalised address); ambiguous duplicates flagged for review.',
    'Jobs retain Job Number; collisions with HQ job_number must not overwrite HQ-created jobs.',
    'Staff names map to scheduling_staff only — never create Auth/staff_profiles from export names.',
    'Unmatched staff names will be created as scheduling_staff (auth_user_id null) on apply.',
    'Schedule windows (past + future) are published as job_appointments on apply; overlaps are reported only.',
    'Tradify In Progress → HQ in_progress when a future schedule window exists; otherwise on_hold for review.',
    'Quotes/invoices/timesheets are included when present in the batch MANIFEST.',
    'Apply path is owner-gated (npm run tradify:apply -- --i-understand-hosted-write).',
  ];
  if (!args.hq) {
    notes.push(
      'Mode csv-only: insert counts assume empty HQ. Pass --local-db for collision/staff matching against local Supabase.',
    );
  }

  return {
    batchId: args.batchId,
    generatedAt: args.generatedAt || new Date().toISOString(),
    mode: args.hq ? 'csv+local-db' : 'csv-only',
    counts,
    statusInventory,
    inProgressSplit,
    inProgressJobs: inProgressJobs
      .slice()
      .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber)),
    unmatchedCustomersForJobs: [...unmatchedCustomersForJobsSet].sort(),
    unmatchedCustomersForSites: [...unmatchedCustomersForSitesSet].sort(),
    duplicateCustomerTradifyIds: [...new Set(duplicateCustomerTradifyIds)].sort(),
    duplicateJobNumbersInExport: duplicateJobNumbersInExport.sort(),
    ambiguousSites: ambiguousSites.slice(0, 200),
    staffNames: staffNamesFinal,
    unmatchedStaffNames,
    matchedStaff,
    hqCollisions: {
      jobNumbers: hqJobNumberCollisions.sort(),
      tradifyIds: hqTradifyIdCollisions.sort(),
    },
    notes,
  };
}

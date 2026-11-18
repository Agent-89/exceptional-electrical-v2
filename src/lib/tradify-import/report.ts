import type {DryRunReport} from './dry-run.ts';

export function formatDryRunMarkdown(report: DryRunReport): string {
  const lines: string[] = [];
  lines.push(`# Tradify dry-run report`);
  lines.push('');
  lines.push(`- Batch: \`${report.batchId}\``);
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Mode: \`${report.mode}\``);
  lines.push('');
  lines.push(`## Counts`);
  lines.push('');
  lines.push('### Customers');
  lines.push(`- Source rows: ${report.counts.customers.source}`);
  lines.push(`- Expected inserts: ${report.counts.customers.insert}`);
  lines.push(`- Skip duplicate Tradify Id: ${report.counts.customers.skipDuplicateKey}`);
  lines.push(`- Missing Tradify Id: ${report.counts.customers.missingTradifyId}`);
  lines.push('');
  lines.push('### Sites');
  lines.push(`- Source rows: ${report.counts.sites.source}`);
  lines.push(`- Expected inserts (unique keys): ${report.counts.sites.insert}`);
  lines.push(`- Ambiguous duplicate keys: ${report.counts.sites.ambiguous}`);
  lines.push(`- Extra duplicate rows: ${report.counts.sites.duplicateKey}`);
  lines.push(`- Unmatched customer name: ${report.counts.sites.unmatchedCustomer}`);
  lines.push('');
  lines.push('### Jobs');
  lines.push(`- Source rows: ${report.counts.jobs.source}`);
  lines.push(`- Expected inserts: ${report.counts.jobs.insert}`);
  lines.push(`- Skip missing job number: ${report.counts.jobs.skipMissingJobNumber}`);
  lines.push(
    `- Skip duplicate job number in export: ${report.counts.jobs.skipDuplicateJobNumberInExport}`,
  );
  lines.push(`- HQ job_number collisions: ${report.counts.jobs.collisionHqJobNumber}`);
  lines.push(`- HQ tradify id collisions: ${report.counts.jobs.collisionHqTradifyId}`);
  lines.push(`- Unmatched customer name: ${report.counts.jobs.unmatchedCustomer}`);
  lines.push('');
  lines.push('### Staff');
  lines.push(`- Unique names: ${report.counts.staff.uniqueNames}`);
  lines.push(`- Matched scheduling_staff: ${report.counts.staff.matchedSchedulingStaff}`);
  lines.push(`- Unmatched names: ${report.counts.staff.unmatchedNames}`);
  lines.push(
    `- Will create scheduling_staff (no Auth): ${report.counts.staff.willCreateSchedulingStaff}`,
  );
  lines.push('');
  lines.push('### Appointments (from job Schedule)');
  lines.push(`- Jobs with Schedule text: ${report.counts.appointments.jobsWithSchedule}`);
  lines.push(`- Parse failures: ${report.counts.appointments.parseFailures}`);
  lines.push(`- Visit windows: ${report.counts.appointments.windows}`);
  lines.push(`- Future: ${report.counts.appointments.future}`);
  lines.push(`- Past: ${report.counts.appointments.past}`);
  lines.push(`- Staff overlap pairs (reported only): ${report.counts.appointments.staffOverlapPairs}`);
  lines.push('');
  lines.push('### Quotes');
  lines.push(`- Source line rows: ${report.counts.quotes.sourceLines}`);
  lines.push(`- Unique quotes: ${report.counts.quotes.uniqueQuotes}`);
  lines.push(`- Unmatched customer: ${report.counts.quotes.unmatchedCustomer}`);
  lines.push('');
  lines.push('### Invoices');
  lines.push(`- Source line rows: ${report.counts.invoices.sourceLines}`);
  lines.push(`- Unique invoices: ${report.counts.invoices.uniqueInvoices}`);
  lines.push(`- Unmatched customer: ${report.counts.invoices.unmatchedCustomer}`);
  lines.push('');
  lines.push('### Timesheets');
  lines.push(`- Source rows: ${report.counts.timesheets.source}`);
  lines.push(`- Parse OK: ${report.counts.timesheets.parseOk}`);
  lines.push(`- Unmatched job: ${report.counts.timesheets.unmatchedJob}`);
  lines.push(`- Unmatched staff (vs HQ snapshot): ${report.counts.timesheets.unmatchedStaff}`);
  lines.push('');
  lines.push('## Status inventory');
  lines.push('');
  for (const status of Object.keys(report.statusInventory).sort()) {
    lines.push(`- ${status}: ${report.statusInventory[status]}`);
  }
  lines.push('');
  lines.push('## In Progress mapping split');
  lines.push('');
  lines.push(
    `- → HQ \`in_progress\` (has future schedule): ${report.inProgressSplit.toInProgress}`,
  );
  lines.push(
    `- → HQ \`on_hold\` (review placeholder): ${report.inProgressSplit.toOnHold}`,
  );
  lines.push('');
  lines.push(`## In Progress jobs (owner review — ${report.inProgressJobs.length})`);
  lines.push('');
  lines.push(
    'Mapped to `in_progress` only when a future Schedule window exists; otherwise `on_hold` for status review.',
  );
  lines.push('');
  if (report.inProgressJobs.length === 0) {
    lines.push('_None_');
  } else {
    const preview = report.inProgressJobs.slice(0, 50);
    for (const job of preview) {
      lines.push(`- ${job.jobNumber} — ${job.customer || '(no customer)'}`);
    }
    if (report.inProgressJobs.length > preview.length) {
      lines.push(`- …and ${report.inProgressJobs.length - preview.length} more (see JSON)`);
    }
  }
  lines.push('');
  lines.push('## Unmatched / collisions');
  lines.push('');
  lines.push(`### Unmatched customers on jobs (${report.unmatchedCustomersForJobs.length})`);
  for (const name of report.unmatchedCustomersForJobs.slice(0, 40)) {
    lines.push(`- ${name}`);
  }
  if (report.unmatchedCustomersForJobs.length > 40) {
    lines.push(`- …and ${report.unmatchedCustomersForJobs.length - 40} more (see JSON)`);
  }
  lines.push('');
  lines.push(`### Unmatched customers on sites (${report.unmatchedCustomersForSites.length})`);
  for (const name of report.unmatchedCustomersForSites.slice(0, 40)) {
    lines.push(`- ${name}`);
  }
  if (report.unmatchedCustomersForSites.length > 40) {
    lines.push(`- …and ${report.unmatchedCustomersForSites.length - 40} more (see JSON)`);
  }
  lines.push('');
  lines.push(`### Ambiguous sites (first ${Math.min(30, report.ambiguousSites.length)})`);
  for (const site of report.ambiguousSites.slice(0, 30)) {
    lines.push(
      `- ${site.customer} / ${site.siteName} (rows ${site.rowNumbers.join(', ')})`,
    );
  }
  lines.push('');
  lines.push(`### HQ job number collisions (${report.hqCollisions.jobNumbers.length})`);
  for (const jn of report.hqCollisions.jobNumbers.slice(0, 40)) lines.push(`- ${jn}`);
  lines.push('');
  lines.push(`### Unmatched staff names (${report.unmatchedStaffNames.length})`);
  for (const name of report.unmatchedStaffNames) lines.push(`- ${name}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push('');
  return lines.join('\n');
}

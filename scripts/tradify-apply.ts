#!/usr/bin/env node
/**
 * Tradify import APPLY — writes to the configured Supabase project.
 *
 * Requires explicit --i-understand-hosted-write for non-local URLs.
 * Requires migration tradify_import_apply_foundation to be applied first.
 *
 * Usage:
 *   npm run tradify:apply -- --batch imports/tradify/2026-11-18 --i-understand-hosted-write
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {
  applyTradifyBatch,
  assertLocalSupabaseUrl,
  buildDryRunReport,
  formatDryRunMarkdown,
  isLocalSupabaseUrl,
  parseCsv,
  rowsToObjects,
  stageRecords,
  verifyManifestFile,
  type TradifyManifest,
} from '../src/lib/tradify-import/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]) {
  let batchDir = join(root, 'imports', 'tradify', '2026-11-18');
  let understandHosted = false;
  let dryRunOnly = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--i-understand-hosted-write') {
      understandHosted = true;
      continue;
    }
    if (arg === '--dry-run-only') {
      dryRunOnly = true;
      continue;
    }
    if (arg === '--batch') {
      const next = argv[i + 1];
      if (!next) throw new Error('--batch requires a path');
      batchDir = resolve(root, next);
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return {batchDir, understandHosted, dryRunOnly};
}

function printHelp() {
  console.log(`Tradify APPLY (database writes)

Usage:
  npm run tradify:apply -- --batch <dir> --i-understand-hosted-write

Options:
  --batch <dir>                    Batch folder with MANIFEST.json + CSVs
  --i-understand-hosted-write      Required when NEXT_PUBLIC_SUPABASE_URL is hosted
  --dry-run-only                   Refresh dry-run report then exit (no writes)
`);
}

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key]) continue;
    process.env[key] = m[2]!.replace(/^"|"$/g, '');
  }
}

function loadCsvObjects(path: string) {
  const text = readFileSync(path, 'utf8');
  return rowsToObjects(parseCsv(text));
}

async function main() {
  const {batchDir, understandHosted, dryRunOnly} = parseArgs(process.argv.slice(2));
  const manifestPath = join(batchDir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`MANIFEST.json not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as TradifyManifest;
  if (manifest.source_system !== 'tradify') {
    throw new Error(`Unexpected source_system: ${manifest.source_system}`);
  }

  const core = ['customer_export.csv', 'site_export.csv', 'job_export.csv'] as const;
  const optional = ['quote_export.csv', 'invoice_export.csv', 'timesheet_export.csv'] as const;

  const staged: Record<string, ReturnType<typeof stageRecords>> = {};

  for (const filename of [...core, ...optional]) {
    const expected = manifest.files[filename];
    if (!expected) {
      if ((core as readonly string[]).includes(filename)) {
        throw new Error(`MANIFEST missing required file entry: ${filename}`);
      }
      continue;
    }
    const filePath = join(batchDir, filename);
    if (!existsSync(filePath)) {
      if ((core as readonly string[]).includes(filename)) {
        throw new Error(`Missing CSV: ${filePath}`);
      }
      console.warn(`Optional file missing, skipping: ${filename}`);
      continue;
    }
    const bytes = readFileSync(filePath);
    const records = loadCsvObjects(filePath);
    const check = verifyManifestFile({
      filename,
      expected,
      bytes,
      dataRowCount: records.length,
    });
    if (!check.ok) {
      console.error(`Manifest check failed for ${filename}:`);
      for (const err of check.errors) console.error(`  - ${err}`);
      throw new Error('Manifest verification failed — refusing apply.');
    }
    staged[filename] = stageRecords({
      sourceFilename: filename,
      batchId: manifest.batch_id,
      records,
    });
  }

  const report = buildDryRunReport({
    batchId: manifest.batch_id,
    customers: staged['customer_export.csv'] || [],
    sites: staged['site_export.csv'] || [],
    jobs: staged['job_export.csv'] || [],
    quotes: staged['quote_export.csv'],
    invoices: staged['invoice_export.csv'],
    timesheets: staged['timesheet_export.csv'],
  });

  const jsonPath = join(batchDir, 'dry-run-report.json');
  const mdPath = join(batchDir, 'dry-run-report.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, formatDryRunMarkdown(report), 'utf8');
  console.log(`Dry-run refreshed → ${mdPath}`);
  console.log(
    `  jobs=${report.counts.jobs.insert} quotes=${report.counts.quotes.uniqueQuotes} invoices=${report.counts.invoices.uniqueInvoices} apptWindows=${report.counts.appointments.windows}`,
  );
  console.log(
    `  In Progress → in_progress=${report.inProgressSplit.toInProgress} on_hold=${report.inProgressSplit.toOnHold}`,
  );

  if (dryRunOnly) {
    console.log('`--dry-run-only` set — no database writes.');
    return;
  }

  loadEnvFile(join(root, '.env.local'));
  loadEnvFile(join(root, '.env'));
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for apply.');
  }

  if (isLocalSupabaseUrl(url)) {
    assertLocalSupabaseUrl(url);
  } else if (!understandHosted) {
    throw new Error(
      'Refusing hosted write. Re-run with --i-understand-hosted-write after reviewing the dry-run report and applying the migration.',
    );
  } else {
    console.warn(`HOSTED WRITE ENABLED against ${url}`);
  }

  const db = createClient(url, key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const summary = await applyTradifyBatch({
    db,
    batchId: manifest.batch_id,
    customers: staged['customer_export.csv'] || [],
    sites: staged['site_export.csv'] || [],
    jobs: staged['job_export.csv'] || [],
    quotes: staged['quote_export.csv'],
    invoices: staged['invoice_export.csv'],
    timesheets: staged['timesheet_export.csv'],
    dryRunReport: report,
    onProgress: (message) => console.log(`  … ${message}`),
  });

  const summaryPath = join(batchDir, 'apply-summary.json');
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log('Apply complete');
  console.log('  created:', JSON.stringify(summary.created));
  console.log('  skipped:', JSON.stringify(summary.skipped));
  console.log(`  errors: ${summary.errors.length}`);
  if (summary.errors.length) {
    for (const err of summary.errors.slice(0, 40)) console.error(`  - ${err}`);
    if (summary.errors.length > 40) {
      console.error(`  …and ${summary.errors.length - 40} more (see ${summaryPath})`);
    }
  }
  console.log(`  Wrote ${summaryPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Tradify import dry-run — local/isolated only.
 * Reads frozen CSVs under imports/tradify/<batch>/, verifies MANIFEST.json,
 * and writes dry-run-report.json + dry-run-report.md next to the batch.
 *
 * Never writes to any database. Optional --local-db performs read-only
 * collision/staff compare against local Supabase (127.0.0.1:54321) only.
 *
 * Usage:
 *   npm run tradify:dry-run -- [--batch imports/tradify/2026-11-12] [--local-db]
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {
  assertLocalSupabaseUrl,
  buildDryRunReport,
  formatDryRunMarkdown,
  parseCsv,
  rowsToObjects,
  stageRecords,
  verifyManifestFile,
  type HqSnapshot,
  type TradifyManifest,
} from '../src/lib/tradify-import/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]) {
  let batchDir = join(root, 'imports', 'tradify', '2026-11-12');
  let localDb = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--local-db') {
      localDb = true;
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
  return {batchDir, localDb};
}

function printHelp() {
  console.log(`Tradify dry-run (no DB writes)

Usage:
  npm run tradify:dry-run -- [--batch <dir>] [--local-db]

Options:
  --batch <dir>   Batch folder containing MANIFEST.json + CSVs
                  (default: imports/tradify/2026-11-12)
  --local-db      Read-only compare against local Supabase only
                  (NEXT_PUBLIC_SUPABASE_URL must be http://127.0.0.1:54321)
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

async function loadHqSnapshot(): Promise<HqSnapshot> {
  loadEnvFile(join(root, '.env.local'));
  loadEnvFile(join(root, '.env'));
  const url = assertLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error('SUPABASE_SECRET_KEY required for --local-db read-only compare');
  }
  const db = createClient(url, key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const jobNumbers = new Set<number>();
  const jobTradifyIds = new Set<string>();
  const customerTradifyIds = new Set<string>();
  const schedulingStaffNames = new Map<string, string>();

  const {data: jobs, error: jobsError} = await db
    .from('jobs')
    .select('job_number,tradify_id,tradify_reference');
  if (jobsError) throw new Error(`Failed reading local jobs: ${jobsError.message}`);
  for (const row of jobs || []) {
    if (typeof row.job_number === 'number') jobNumbers.add(row.job_number);
    if (row.tradify_id) jobTradifyIds.add(String(row.tradify_id));
    if (row.tradify_reference) jobTradifyIds.add(String(row.tradify_reference));
  }

  // Customers may not have a tradify column in all schemas; ignore missing column.
  const {data: customers, error: customersError} = await db
    .from('customers')
    .select('id,name');
  if (customersError) {
    console.warn(`Skipping customer snapshot: ${customersError.message}`);
  } else {
    for (const row of customers || []) {
      // No tradify id column guaranteed — keep set empty unless present on row.
      const anyRow = row as Record<string, unknown>;
      if (anyRow.tradify_id) customerTradifyIds.add(String(anyRow.tradify_id));
    }
  }

  const {data: staff, error: staffError} = await db
    .from('scheduling_staff')
    .select('id,full_name');
  if (staffError) throw new Error(`Failed reading local scheduling_staff: ${staffError.message}`);
  for (const row of staff || []) {
    if (row.id && row.full_name) {
      schedulingStaffNames.set(String(row.id), String(row.full_name));
    }
  }

  return {jobNumbers, jobTradifyIds, customerTradifyIds, schedulingStaffNames};
}

function loadCsvObjects(path: string) {
  const text = readFileSync(path, 'utf8');
  return rowsToObjects(parseCsv(text));
}

async function main() {
  const {batchDir, localDb} = parseArgs(process.argv.slice(2));
  const manifestPath = join(batchDir, 'MANIFEST.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`MANIFEST.json not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as TradifyManifest;
  if (manifest.source_system !== 'tradify') {
    throw new Error(`Unexpected source_system: ${manifest.source_system}`);
  }

  const required = ['customer_export.csv', 'site_export.csv', 'job_export.csv'] as const;
  const staged: Record<(typeof required)[number], ReturnType<typeof stageRecords>> = {
    'customer_export.csv': [],
    'site_export.csv': [],
    'job_export.csv': [],
  };

  const checks = [];
  for (const filename of required) {
    const expected = manifest.files[filename];
    if (!expected) throw new Error(`MANIFEST missing file entry: ${filename}`);
    const filePath = join(batchDir, filename);
    if (!existsSync(filePath)) throw new Error(`Missing CSV: ${filePath}`);
    const bytes = readFileSync(filePath);
    const records = loadCsvObjects(filePath);
    const check = verifyManifestFile({
      filename,
      expected,
      bytes,
      dataRowCount: records.length,
    });
    checks.push(check);
    if (!check.ok) {
      console.error(`Manifest check failed for ${filename}:`);
      for (const err of check.errors) console.error(`  - ${err}`);
    }
    staged[filename] = stageRecords({
      sourceFilename: filename,
      batchId: manifest.batch_id,
      records,
    });
  }

  if (checks.some((c) => !c.ok)) {
    throw new Error('Manifest verification failed — refusing to emit dry-run report.');
  }

  let hq: HqSnapshot | null = null;
  if (localDb) {
    hq = await loadHqSnapshot();
    console.log(
      `Local HQ snapshot: ${hq.jobNumbers.size} job numbers, ${hq.schedulingStaffNames.size} scheduling_staff`,
    );
  }

  const report = buildDryRunReport({
    batchId: manifest.batch_id,
    customers: staged['customer_export.csv'],
    sites: staged['site_export.csv'],
    jobs: staged['job_export.csv'],
    hq,
  });

  const jsonPath = join(batchDir, 'dry-run-report.json');
  const mdPath = join(batchDir, 'dry-run-report.md');
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(mdPath, formatDryRunMarkdown(report), 'utf8');

  console.log(`Dry-run complete (${report.mode})`);
  console.log(`  customers insert=${report.counts.customers.insert} / source=${report.counts.customers.source}`);
  console.log(`  sites insert=${report.counts.sites.insert} / source=${report.counts.sites.source}`);
  console.log(`  jobs insert=${report.counts.jobs.insert} / source=${report.counts.jobs.source}`);
  console.log(`  In Progress jobs: ${report.inProgressJobs.length}`);
  console.log(`  Wrote ${jsonPath}`);
  console.log(`  Wrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

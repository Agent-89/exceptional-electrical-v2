#!/usr/bin/env node
/**
 * Merge Tradify-imported duplicate visits (same job + start + end, one row per electrician).
 *
 * Usage:
 *   npm run tradify:merge-visits -- --batch-id tradify-2026-11-18 --i-understand-hosted-write
 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {
  isLocalSupabaseUrl,
  assertLocalSupabaseUrl,
  mergeDuplicateTradifyVisits,
} from '../src/lib/tradify-import/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]) {
  let batchId = 'tradify-2026-11-18';
  let understandHosted = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--i-understand-hosted-write') {
      understandHosted = true;
      continue;
    }
    if (arg === '--batch-id') {
      const next = argv[i + 1];
      if (!next) throw new Error('--batch-id requires a value');
      batchId = next;
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(`Merge duplicate Tradify visits

Usage:
  npm run tradify:merge-visits -- --batch-id tradify-2026-11-18 --i-understand-hosted-write
`);
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return {batchId, understandHosted};
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

async function main() {
  const {batchId, understandHosted} = parseArgs(process.argv.slice(2));
  loadEnvFile(join(root, '.env.local'));
  loadEnvFile(join(root, '.env'));
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  }
  if (isLocalSupabaseUrl(url)) {
    assertLocalSupabaseUrl(url);
  } else if (!understandHosted) {
    throw new Error(
      'Refusing hosted write. Re-run with --i-understand-hosted-write after reviewing.',
    );
  } else {
    console.warn(`HOSTED WRITE ENABLED against ${url}`);
  }

  const db = createClient(url, key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  const summary = await mergeDuplicateTradifyVisits({
    db,
    batchId,
    onProgress: (message) => console.log(`  … ${message}`),
  });

  const outPath = join(root, 'imports', 'tradify', '2026-11-18', 'merge-visits-summary.json');
  try {
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${outPath}`);
  } catch {
    // batch folder may differ; still print summary
  }

  console.log('Merge complete');
  console.log(`  groupsFound=${summary.groupsFound}`);
  console.log(`  appointmentsDeleted=${summary.appointmentsDeleted}`);
  console.log(`  staffLinksMoved=${summary.staffLinksMoved}`);
  console.log(`  rowMapRewritten=${summary.rowMapRewritten}`);
  console.log(`  errors=${summary.errors.length}`);
  for (const err of summary.errors.slice(0, 30)) console.error(`  - ${err}`);
  if (summary.errors.length) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

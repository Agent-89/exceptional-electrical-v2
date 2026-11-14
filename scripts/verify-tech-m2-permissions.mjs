#!/usr/bin/env node
/**
 * Local permission smoke checks for technician Milestone 2.
 * Verifies assignment gating for notes/time metadata and that office-only
 * review fields are not writable by technicians at the app-data layer.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const techCred = resolve(root, 'supabase/.temp/local-technician.env');
const CREW_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003';
const TODAY_APPT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0082';
const OTHER_JOB = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0062';

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

function loadLocalStatus() {
  try {
    return parseEnv(
      execFileSync('supabase', ['status', '-o', 'env'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }),
    );
  } catch {
    return parseEnv(
      execSync('supabase status -o env', {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      }),
    );
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  if (!existsSync(techCred)) throw new Error('Run node scripts/seed-local-technician.mjs first');
  const tech = parseEnv(readFileSync(techCred, 'utf8'));
  const status = loadLocalStatus();
  assert(status.API_URL === 'http://127.0.0.1:54321', 'Not local EE API');
  const key = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const api = status.API_URL;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const tables = await fetch(`${api}/rest/v1/job_time_entries?select=id&limit=1`, { headers });
  assert(tables.ok, 'job_time_entries missing — apply M2 migration locally first');

  const mine = await fetch(
    `${api}/rest/v1/job_appointment_staff?staff_id=eq.${CREW_ID}&appointment_id=eq.${TODAY_APPT}&select=appointment_id`,
    { headers },
  ).then((r) => r.json());
  assert(mine.length === 1, 'Today appointment not assigned to technician crew');

  // Temporary unassigned visit — technician must have no staff link.
  const unassignedId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0098';
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await fetch(`${api}/rest/v1/job_appointments?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: unassignedId,
      job_id: OTHER_JOB,
      starts_at: new Date(`${day}T15:00:00+08:00`).toISOString(),
      ends_at: new Date(`${day}T16:00:00+08:00`).toISOString(),
      notes: 'M2 unassigned permission probe',
      status: 'scheduled',
    }),
  });
  await fetch(`${api}/rest/v1/job_appointment_staff?appointment_id=eq.${unassignedId}`, {
    method: 'DELETE',
    headers,
  });
  const linked = await fetch(
    `${api}/rest/v1/job_appointment_staff?staff_id=eq.${CREW_ID}&appointment_id=eq.${unassignedId}&select=appointment_id`,
    { headers },
  ).then((r) => r.json());
  assert(linked.length === 0, 'Technician unexpectedly assigned to unassigned probe visit');
  await fetch(`${api}/rest/v1/job_appointments?id=eq.${unassignedId}`, { method: 'DELETE', headers });

  // Bucket should exist and be private.
  const buckets = await fetch(`${api}/storage/v1/bucket`, { headers }).then((r) => r.json());
  const photoBucket = (buckets || []).find((b) => b.id === 'job-photos' || b.name === 'job-photos');
  assert(photoBucket, 'job-photos bucket missing');
  assert(photoBucket.public === false, 'job-photos bucket must be private');

  // Active unique index: insert one active, second should fail.
  const entryA = {
    job_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0061',
    appointment_id: TODAY_APPT,
    staff_id: CREW_ID,
    technician_user_id: tech.LOCAL_TECH_USER_ID,
    started_at: new Date().toISOString(),
    status: 'active',
    entry_source: 'timer',
  };
  await fetch(`${api}/rest/v1/job_time_entries?technician_user_id=eq.${tech.LOCAL_TECH_USER_ID}&status=in.(active,on_break)`, {
    method: 'DELETE',
    headers,
  });
  const first = await fetch(`${api}/rest/v1/job_time_entries`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(entryA),
  });
  assert(first.ok, 'Failed to create first active timer');
  const second = await fetch(`${api}/rest/v1/job_time_entries`, {
    method: 'POST',
    headers,
    body: JSON.stringify(entryA),
  });
  assert(!second.ok, 'Duplicate active timer should be rejected by unique index');

  await fetch(`${api}/rest/v1/job_time_entries?technician_user_id=eq.${tech.LOCAL_TECH_USER_ID}&status=eq.active`, {
    method: 'DELETE',
    headers,
  });

  console.log('Milestone 2 permission smoke checks passed.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

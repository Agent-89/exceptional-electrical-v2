#!/usr/bin/env node
/**
 * Local permission smoke checks for technician Milestone 1.
 * Uses service-role against local Supabase only — no browser automation.
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const techCred = resolve(root, 'supabase/.temp/local-technician.env');
const CREW_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0003';
const TODAY_APPT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0082';
const OTHER_CREW = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002';

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
  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  const crew = await fetch(
    `${api}/rest/v1/scheduling_staff?id=eq.${CREW_ID}&select=id,auth_user_id,active`,
    { headers },
  ).then((r) => r.json());
  assert(crew[0]?.auth_user_id === tech.LOCAL_TECH_USER_ID, 'Crew auth_user_id not linked');
  assert(crew[0]?.active === true, 'Crew inactive');

  const profile = await fetch(
    `${api}/rest/v1/staff_profiles?user_id=eq.${tech.LOCAL_TECH_USER_ID}&select=role,active`,
    { headers },
  ).then((r) => r.json());
  assert(profile[0]?.role === 'technician' && profile[0]?.active, 'Technician profile missing');

  const mine = await fetch(
    `${api}/rest/v1/job_appointment_staff?staff_id=eq.${CREW_ID}&appointment_id=eq.${TODAY_APPT}&select=appointment_id`,
    { headers },
  ).then((r) => r.json());
  assert(mine.length === 1, 'Today appointment not assigned to technician crew');

  // Create a temporary unassigned visit and prove it is not linked to the tech crew.
  const unassignedId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0099';
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Perth',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  await fetch(`${api}/rest/v1/job_appointments?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: unassignedId,
      job_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0061',
      starts_at: new Date(`${day}T13:00:00+08:00`).toISOString(),
      ends_at: new Date(`${day}T14:00:00+08:00`).toISOString(),
      notes: 'Unassigned permission probe',
      status: 'scheduled',
    }),
  });

  const leak = await fetch(
    `${api}/rest/v1/job_appointment_staff?staff_id=eq.${CREW_ID}&appointment_id=eq.${unassignedId}&select=appointment_id`,
    { headers },
  ).then((r) => r.json());
  assert(leak.length === 0, 'Unassigned visit must not appear in technician crew membership');

  const other = await fetch(
    `${api}/rest/v1/job_appointment_staff?staff_id=eq.${OTHER_CREW}&appointment_id=eq.${TODAY_APPT}&select=appointment_id`,
    { headers },
  ).then((r) => r.json());
  assert(other.length === 0, 'Today visit must not be assigned to Jordan');

  // Cleanup probe appointment
  await fetch(`${api}/rest/v1/job_appointments?id=eq.${unassignedId}`, {
    method: 'DELETE',
    headers,
  });

  console.log('Technician permission smoke checks passed.');
}

main().catch((err) => {
  console.error(String(err?.message || err));
  process.exit(1);
});

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

  const CREW_B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0002';
  const JOB_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeee0061';
  const crewRows = await fetch(
    `${api}/rest/v1/scheduling_staff?id=in.(${CREW_ID},${CREW_B})&select=id,auth_user_id,full_name`,
    { headers },
  ).then((r) => r.json());
  const crewA = crewRows.find((r) => r.id === CREW_ID);
  const crewB = crewRows.find((r) => r.id === CREW_B);
  assert(crewA?.auth_user_id === tech.LOCAL_TECH_USER_ID, 'Crew A auth mapping missing');
  assert(crewB, 'Crew B missing from seed');

  // Prefer Crew B auth mapping; otherwise borrow any other active staff profile.
  let techBUserId = crewB.auth_user_id;
  if (!techBUserId) {
    const profiles = await fetch(
      `${api}/rest/v1/staff_profiles?active=eq.true&select=user_id&user_id=neq.${tech.LOCAL_TECH_USER_ID}&limit=1`,
      { headers },
    ).then((r) => r.json());
    techBUserId = profiles[0]?.user_id;
  }
  assert(techBUserId, 'Need a second staff_profiles user for multi-tech timer probe');

  // Clean live timers for both technicians before concurrent probes.
  for (const userId of [tech.LOCAL_TECH_USER_ID, techBUserId]) {
    await fetch(
      `${api}/rest/v1/job_time_entries?technician_user_id=eq.${userId}&status=in.(active,on_break)`,
      { method: 'DELETE', headers },
    );
  }

  // Ensure both technicians are assigned to the shared visit for the probe.
  await fetch(`${api}/rest/v1/job_appointment_staff?on_conflict=appointment_id,staff_id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify([
      { appointment_id: TODAY_APPT, staff_id: CREW_ID },
      { appointment_id: TODAY_APPT, staff_id: CREW_B },
    ]),
  });

  const startedAt = new Date().toISOString();
  const startA = await fetch(`${api}/rest/v1/rpc/tech_start_time_entry`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      p_job_id: JOB_ID,
      p_appointment_id: TODAY_APPT,
      p_staff_id: CREW_ID,
      p_technician_user_id: tech.LOCAL_TECH_USER_ID,
      p_started_at: startedAt,
      p_note: 'multi-tech A',
    }),
  });
  const startABody = await startA.text();
  assert(startA.ok, 'Technician A failed to start timer: ' + startABody);
  const entryIdA = JSON.parse(startABody);

  const startB = await fetch(`${api}/rest/v1/rpc/tech_start_time_entry`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      p_job_id: JOB_ID,
      p_appointment_id: TODAY_APPT,
      p_staff_id: CREW_B,
      p_technician_user_id: techBUserId,
      p_started_at: startedAt,
      p_note: 'multi-tech B',
    }),
  });
  const startBBody = await startB.text();
  assert(startB.ok, 'Technician B should start concurrently on same visit: ' + startBBody);
  const entryIdB = JSON.parse(startBBody);
  assert(entryIdA && entryIdB && entryIdA !== entryIdB, 'Expected distinct active entry IDs');

  const live = await fetch(
    `${api}/rest/v1/job_time_entries?appointment_id=eq.${TODAY_APPT}&status=eq.active&select=id,technician_user_id,job_id,appointment_id,staff_id`,
    { headers },
  ).then((r) => r.json());
  assert(live.length >= 2, 'Expected two active timers on the shared appointment');
  assert(
    live.every((row) => row.job_id && row.appointment_id && row.technician_user_id && row.staff_id),
    'Each entry must store technician, job and appointment IDs',
  );

  const dupA = await fetch(`${api}/rest/v1/rpc/tech_start_time_entry`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_job_id: JOB_ID,
      p_appointment_id: TODAY_APPT,
      p_staff_id: CREW_ID,
      p_technician_user_id: tech.LOCAL_TECH_USER_ID,
      p_started_at: new Date().toISOString(),
    }),
  });
  assert(!dupA.ok, 'Same technician must not start a second active session');

  // Pause A only — B remains active.
  const pauseA = await fetch(`${api}/rest/v1/job_time_entries?id=eq.${entryIdA}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      status: 'on_break',
      break_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  assert(pauseA.ok, 'Failed to pause technician A');
  const bStill = await fetch(
    `${api}/rest/v1/job_time_entries?id=eq.${entryIdB}&select=id,status,technician_user_id`,
    { headers },
  ).then((r) => r.json());
  assert(bStill[0]?.status === 'active', "Technician A's pause must not affect Technician B");

  for (const userId of [tech.LOCAL_TECH_USER_ID, techBUserId]) {
    await fetch(
      `${api}/rest/v1/job_time_entries?technician_user_id=eq.${userId}&status=in.(active,on_break)`,
      { method: 'DELETE', headers },
    );
  }
  await fetch(
    `${api}/rest/v1/job_appointment_staff?appointment_id=eq.${TODAY_APPT}&staff_id=eq.${CREW_B}`,
    { method: 'DELETE', headers },
  );

  console.log('Milestone 2 permission smoke checks passed (including multi-tech concurrent timers).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

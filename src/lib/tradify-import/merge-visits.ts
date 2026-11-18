/**
 * Pure + DB helpers to merge duplicate Tradify-imported visits that share
 * job_id + starts_at + ends_at (one line per electrician in the export).
 */
import type {SupabaseClient} from '@supabase/supabase-js';
import {appointmentSourceKey, normalizeJobNumber} from './normalize.ts';

export type DuplicateVisitGroup = {
  jobId: string;
  startsAt: string;
  endsAt: string;
  appointmentIds: string[];
};

export type MergeVisitsSummary = {
  groupsFound: number;
  appointmentsDeleted: number;
  staffLinksMoved: number;
  rowMapRewritten: number;
  errors: string[];
};

/** Group appointment rows that share exact job + window. */
export function findDuplicateVisitGroups(
  rows: {id: string; job_id: string; starts_at: string; ends_at: string}[],
): DuplicateVisitGroup[] {
  const byKey = new Map<string, DuplicateVisitGroup>();
  for (const row of rows) {
    const key = `${row.job_id}|${row.starts_at}|${row.ends_at}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.appointmentIds.push(row.id);
    } else {
      byKey.set(key, {
        jobId: row.job_id,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        appointmentIds: [row.id],
      });
    }
  }
  return [...byKey.values()].filter((g) => g.appointmentIds.length > 1);
}

/** Prefer lexicographically smallest UUID as survivor (stable). */
export function pickSurvivorId(ids: string[]): string {
  return [...ids].sort()[0]!;
}

export async function mergeDuplicateTradifyVisits(args: {
  db: SupabaseClient;
  batchId: string;
  onProgress?: (message: string) => void;
}): Promise<MergeVisitsSummary> {
  const log = args.onProgress || (() => undefined);
  const summary: MergeVisitsSummary = {
    groupsFound: 0,
    appointmentsDeleted: 0,
    staffLinksMoved: 0,
    rowMapRewritten: 0,
    errors: [],
  };

  // Load tradify jobs → job numbers for row_map rewrite
  const jobNumberById = new Map<string, string>();
  {
    let from = 0;
    for (;;) {
      const {data, error} = await args.db
        .from('jobs')
        .select('id,job_number,tradify_id,source')
        .eq('source', 'tradify')
        .range(from, from + 999);
      if (error) throw new Error(`jobs page failed: ${error.message}`);
      const rows = data || [];
      for (const row of rows) {
        const jn =
          (row.tradify_id && normalizeJobNumber(String(row.tradify_id))) ||
          (typeof row.job_number === 'number'
            ? `JB${String(row.job_number).padStart(5, '0')}`
            : null);
        if (row.id && jn) jobNumberById.set(String(row.id), jn);
      }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  const tradifyJobIds = [...jobNumberById.keys()];
  if (!tradifyJobIds.length) {
    log('No tradify jobs found.');
    return summary;
  }

  const appointments: {id: string; job_id: string; starts_at: string; ends_at: string}[] =
    [];
  // Query in chunks of job ids
  for (let i = 0; i < tradifyJobIds.length; i += 100) {
    const slice = tradifyJobIds.slice(i, i + 100);
    const {data, error} = await args.db
      .from('job_appointments')
      .select('id,job_id,starts_at,ends_at')
      .in('job_id', slice);
    if (error) throw new Error(`appointments page failed: ${error.message}`);
    for (const row of data || []) {
      appointments.push({
        id: String(row.id),
        job_id: String(row.job_id),
        starts_at: String(row.starts_at),
        ends_at: String(row.ends_at),
      });
    }
  }

  const groups = findDuplicateVisitGroups(appointments);
  summary.groupsFound = groups.length;
  log(`Found ${groups.length} duplicate visit groups.`);

  for (const group of groups) {
    const survivorId = pickSurvivorId(group.appointmentIds);
    const losers = group.appointmentIds.filter((id) => id !== survivorId);

    // Collect staff from all appointments in the group
    const {data: staffRows, error: staffError} = await args.db
      .from('job_appointment_staff')
      .select('appointment_id,staff_id')
      .in('appointment_id', group.appointmentIds);
    if (staffError) {
      summary.errors.push(`staff read ${survivorId}: ${staffError.message}`);
      continue;
    }

    const staffOnSurvivor = new Set(
      (staffRows || [])
        .filter((r) => String(r.appointment_id) === survivorId)
        .map((r) => String(r.staff_id)),
    );
    const toAdd: {appointment_id: string; staff_id: string}[] = [];
    for (const row of staffRows || []) {
      const staffId = String(row.staff_id);
      if (staffOnSurvivor.has(staffId)) continue;
      if (String(row.appointment_id) === survivorId) continue;
      staffOnSurvivor.add(staffId);
      toAdd.push({appointment_id: survivorId, staff_id: staffId});
    }
    if (toAdd.length) {
      const {error: addError} = await args.db.from('job_appointment_staff').insert(toAdd);
      if (addError) {
        summary.errors.push(`staff move ${survivorId}: ${addError.message}`);
        continue;
      }
      summary.staffLinksMoved += toAdd.length;
    }

    // Delete staff links on losers, then loser appointments
    if (losers.length) {
      const {error: delStaffError} = await args.db
        .from('job_appointment_staff')
        .delete()
        .in('appointment_id', losers);
      if (delStaffError) {
        summary.errors.push(`staff delete: ${delStaffError.message}`);
        continue;
      }
      const {error: delApptError} = await args.db
        .from('job_appointments')
        .delete()
        .in('id', losers);
      if (delApptError) {
        summary.errors.push(`appt delete: ${delApptError.message}`);
        continue;
      }
      summary.appointmentsDeleted += losers.length;
    }

    // Rewrite import_row_map: remove old staff-keyed rows for this window; upsert crew-agnostic key
    const jobNumber = jobNumberById.get(group.jobId);
    if (jobNumber) {
      const newKey = appointmentSourceKey(
        jobNumber,
        new Date(group.startsAt),
        new Date(group.endsAt),
      );
      const prefix = `${jobNumber}|${new Date(group.startsAt).toISOString()}|${new Date(group.endsAt).toISOString()}`;
      // Delete any appointment map rows for this window (old staff-suffixed or new)
      const {data: mapRows} = await args.db
        .from('import_row_map')
        .select('id,source_key')
        .eq('entity', 'appointment')
        .eq('batch_id', args.batchId)
        .like('source_key', `${prefix}%`);
      if (mapRows?.length) {
        const {error: delMapError} = await args.db
          .from('import_row_map')
          .delete()
          .in(
            'id',
            mapRows.map((r) => r.id),
          );
        if (delMapError) {
          summary.errors.push(`row_map delete: ${delMapError.message}`);
        }
      }
      const {error: upsertError} = await args.db.from('import_row_map').upsert(
        {
          batch_id: args.batchId,
          entity: 'appointment',
          source_key: newKey,
          hq_id: survivorId,
        },
        {onConflict: 'entity,source_key'},
      );
      if (upsertError) {
        summary.errors.push(`row_map upsert ${newKey}: ${upsertError.message}`);
      } else {
        summary.rowMapRewritten += 1;
      }
    }
  }

  return summary;
}

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import sharp from 'sharp';
import {
  assertOfficeOps,
  dbAdmin,
  requireOfficeUser,
  requireTechnicianAppointmentAccess,
  requireTechnicianCrew,
  technicianHasAppointmentAccess,
} from '@/lib/hq-auth';
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from '@/lib/tech-field-constants';
import {
  VISIT_REPORT_CONFLICT_MESSAGE,
  buildVisitReportPatch,
  isVisitOutcomeStatus,
  normalizeVisitReportText,
  resolveTechnicianVisitOutcome,
  visitOutcomeUpdatesJobStatus,
  visitReportSnapshotsMatch,
  type VisitReportSnapshot,
} from '@/lib/tech-visit-report';
import {
  computeWorkedMinutes,
  elapsedWholeMinutes,
  getActiveTimeEntryForTechnician,
  getTimeEntry,
  syncAppointmentFieldStatusFromLiveTimers,
} from '@/lib/tech-time';

function revalidateVisit(appointmentId: string, jobId: string) {
  revalidatePath('/hq/tech');
  revalidatePath('/hq/tech/jobs');
  revalidatePath('/hq/tech/jobs/' + jobId);
  revalidatePath('/hq/tech/visits/' + appointmentId);
  revalidatePath('/hq/jobs/' + jobId);
  revalidatePath('/hq/timesheets');
}

function textField(formData: FormData, key: string, max: number): string | null {
  const raw = String(formData.get(key) ?? '').trim();
  if (!raw) return null;
  return raw.slice(0, max);
}

async function assertAssignedAppointment(appointmentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) throw new Error('Invalid appointment.');
  const crew = await requireTechnicianAppointmentAccess(appointmentId);
  const db = dbAdmin();
  const { data: visit, error } = await db
    .from('job_appointments')
    .select('id,job_id,status,field_status,starts_at,ends_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error || !visit) throw new Error('Visit not found.');
  return { crew, visit };
}

export async function startWorkAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  const note = textField(formData, 'note', 2000);
  const db = dbAdmin();
  const startedAt = new Date().toISOString();

  const { data, error } = await db.rpc('tech_start_time_entry', {
    p_job_id: visit.job_id,
    p_appointment_id: visit.id,
    p_staff_id: crew.staffId,
    p_technician_user_id: crew.id,
    p_started_at: startedAt,
    p_note: note,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ACTIVE_SESSION_EXISTS')) {
      throw new Error('You already have an active work timer. Finish or pause it before starting another.');
    }
    throw new Error('Unable to start work timer.');
  }

  if (visit.field_status === 'scheduled' || visit.field_status === 'paused') {
    await db
      .from('job_appointments')
      .update({ field_status: 'in_progress' })
      .eq('id', visit.id)
      .in('field_status', ['scheduled', 'paused']);
  }

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'time_started',
    note: 'Timer started for visit ' + visit.id + (data ? ' · entry ' + data : ''),
  });

  revalidateVisit(visit.id, visit.job_id);
}

export async function pauseWorkAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const entryId = String(formData.get('entry_id') || '');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) throw new Error('Invalid time entry.');

  const db = dbAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('job_time_entries')
    .update({
      status: 'on_break',
      break_started_at: now,
      updated_at: now,
    })
    .eq('id', entryId)
    .eq('technician_user_id', crew.id)
    .eq('appointment_id', visit.id)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Unable to start break. Timer may already be paused.');

  // Do not mark the shared visit paused while another technician is still working.
  await syncAppointmentFieldStatusFromLiveTimers(visit.id);

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'time_paused',
    note: 'Break started · entry ' + entryId,
  });

  revalidateVisit(visit.id, visit.job_id);
}

export async function resumeWorkAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const entryId = String(formData.get('entry_id') || '');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) throw new Error('Invalid time entry.');

  const entry = await getTimeEntry(entryId);
  if (!entry || entry.technicianUserId !== crew.id || entry.appointmentId !== visit.id) {
    throw new Error('Time entry not found.');
  }
  if (entry.status !== 'on_break' || !entry.breakStartedAt) {
    throw new Error('Timer is not on break.');
  }

  const now = new Date().toISOString();
  const breakMinutes = entry.breakMinutes + elapsedWholeMinutes(entry.breakStartedAt, now);
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .update({
      status: 'active',
      break_started_at: null,
      break_minutes: breakMinutes,
      updated_at: now,
    })
    .eq('id', entryId)
    .eq('status', 'on_break')
    .eq('technician_user_id', crew.id)
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Unable to resume work.');

  await syncAppointmentFieldStatusFromLiveTimers(visit.id);

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'time_resumed',
    note: 'Break ended · entry ' + entryId,
  });

  revalidateVisit(visit.id, visit.job_id);
}

export async function finishWorkAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const entryId = String(formData.get('entry_id') || '');
  const note = textField(formData, 'note', 2000);
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) throw new Error('Invalid time entry.');

  const entry = await getTimeEntry(entryId);
  if (!entry || entry.technicianUserId !== crew.id || entry.appointmentId !== visit.id) {
    throw new Error('Time entry not found.');
  }
  if (entry.status !== 'active' && entry.status !== 'on_break') {
    throw new Error('Timer is not running.');
  }

  const now = new Date().toISOString();
  let breakMinutes = entry.breakMinutes;
  if (entry.status === 'on_break' && entry.breakStartedAt) {
    breakMinutes += elapsedWholeMinutes(entry.breakStartedAt, now);
  }
  const worked = computeWorkedMinutes(entry.startedAt, now, breakMinutes);
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .update({
      status: 'submitted',
      ended_at: now,
      break_started_at: null,
      break_minutes: breakMinutes,
      worked_minutes: worked,
      note: note ?? entry.note,
      updated_at: now,
      original_started_at: entry.startedAt,
      original_ended_at: now,
      original_break_minutes: breakMinutes,
      original_worked_minutes: worked,
    })
    .eq('id', entryId)
    .in('status', ['active', 'on_break'])
    .eq('technician_user_id', crew.id)
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Unable to finish work timer.');

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'time_submitted',
    note: `Worked ${worked} min · break ${breakMinutes} min · entry ${entryId}`,
  });

  // Timer finish never completes the visit or the overall job — only records time.
  revalidateVisit(visit.id, visit.job_id);
  redirect(`/hq/tech/visits/${visit.id}?time=recorded#visit-report`);
}

export async function addManualTimeEntryAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  const startLocal = String(formData.get('started_at') || '');
  const endLocal = String(formData.get('ended_at') || '');
  const breakMinutes = Math.max(0, Math.min(24 * 60, Number(formData.get('break_minutes') || 0) || 0));
  const note = textField(formData, 'note', 2000);

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startLocal) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endLocal)) {
    throw new Error('Enter valid start and end times.');
  }
  const startedAt = new Date(startLocal + '+08:00');
  const endedAt = new Date(endLocal + '+08:00');
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime()) || endedAt <= startedAt) {
    throw new Error('End time must be after start time.');
  }
  const worked = computeWorkedMinutes(startedAt.toISOString(), endedAt.toISOString(), breakMinutes);
  if (worked <= 0) throw new Error('Worked time must be greater than zero after breaks.');

  const active = await getActiveTimeEntryForTechnician(crew.id);
  if (active) throw new Error('Finish your active timer before adding a manual entry.');

  const db = dbAdmin();
  const { data, error } = await db
    .from('job_time_entries')
    .insert({
      job_id: visit.job_id,
      appointment_id: visit.id,
      staff_id: crew.staffId,
      technician_user_id: crew.id,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      break_minutes: breakMinutes,
      worked_minutes: worked,
      status: 'submitted',
      entry_source: 'manual',
      note,
      original_started_at: startedAt.toISOString(),
      original_ended_at: endedAt.toISOString(),
      original_break_minutes: breakMinutes,
      original_worked_minutes: worked,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Unable to save manual time entry.');

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'time_manual_added',
    note: `Manual entry ${worked} min · ${data.id}`,
  });

  revalidateVisit(visit.id, visit.job_id);
}

async function countAppointmentTechnicians(appointmentId: string): Promise<number> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_appointment_staff')
    .select('staff_id')
    .eq('appointment_id', appointmentId)
    .limit(50);
  if (error) throw new Error('Unable to load visit crew.');
  return new Set((data ?? []).map((row) => row.staff_id as string)).size;
}

function expectedVisitReportSnapshot(formData: FormData): VisitReportSnapshot {
  return {
    fieldStatus: String(formData.get('expected_field_status') || ''),
    completionNote: normalizeVisitReportText(String(formData.get('expected_completion_note') ?? '')),
    outstandingWork: normalizeVisitReportText(String(formData.get('expected_outstanding_work') ?? '')),
    issues: normalizeVisitReportText(String(formData.get('expected_issues') ?? '')),
    furtherVisitRequired: String(formData.get('expected_follow_up_required') || '') === 'yes',
  };
}

function snapshotFromAppointmentRow(row: {
  field_status: string;
  field_completion_note: string | null;
  field_outstanding_work: string | null;
  field_issues: string | null;
  field_follow_up_required: boolean;
}): VisitReportSnapshot {
  return {
    fieldStatus: row.field_status,
    completionNote: normalizeVisitReportText(row.field_completion_note),
    outstandingWork: normalizeVisitReportText(row.field_outstanding_work),
    issues: normalizeVisitReportText(row.field_issues),
    furtherVisitRequired: Boolean(row.field_follow_up_required),
  };
}

/** Conditional update matching the form's loaded snapshot (null-aware). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyVisitReportExpectation(query: any, expected: VisitReportSnapshot) {
  let next = query
    .eq('field_status', expected.fieldStatus)
    .eq('field_follow_up_required', expected.furtherVisitRequired);
  next = expected.completionNote
    ? next.eq('field_completion_note', expected.completionNote)
    : next.is('field_completion_note', null);
  next = expected.outstandingWork
    ? next.eq('field_outstanding_work', expected.outstandingWork)
    : next.is('field_outstanding_work', null);
  next = expected.issues ? next.eq('field_issues', expected.issues) : next.is('field_issues', null);
  return next;
}

export async function updateVisitProgressAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const requested = String(formData.get('field_status') || '');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  const assignedCount = await countAppointmentTechnicians(visit.id);
  const resolved = resolveTechnicianVisitOutcome({
    requested,
    assignedTechnicianCount: assignedCount,
  });
  if (!resolved.ok) throw new Error(resolved.error);

  const completionNote = textField(formData, 'completion_note', 2000);
  const outstanding = textField(formData, 'outstanding_work', 2000);
  const issues = textField(formData, 'issues', 2000);
  const furtherVisit = String(formData.get('follow_up_required') || '') === 'yes';
  const expected = expectedVisitReportSnapshot(formData);
  const built = buildVisitReportPatch({
    fieldStatus: resolved.fieldStatus,
    fields: {
      completionNote,
      outstandingWork: outstanding,
      issues,
      furtherVisitRequired: furtherVisit,
    },
    currentAppointmentStatus: visit.status,
    completedAtIso: new Date().toISOString(),
  });

  // Guardrail: visit reporting must never mutate jobs.status.
  if (visitOutcomeUpdatesJobStatus()) {
    throw new Error('Visit reporting misconfigured: job status must stay unchanged.');
  }

  const patch: Record<string, unknown> = {
    field_status: built.fieldStatus,
    field_completion_note: built.completionNote,
    field_outstanding_work: built.outstandingWork,
    field_issues: built.issues,
    field_follow_up_required: built.furtherVisitRequired,
  };
  if (built.fieldCompletedAt) patch.field_completed_at = built.fieldCompletedAt;
  else patch.field_completed_at = null;
  // Visit-level schedule status only — never flips the parent job to completed.
  if (built.appointmentStatusCompleted) patch.status = 'completed';

  const db = dbAdmin();
  const { data: current, error: currentError } = await db
    .from('job_appointments')
    .select(
      'id,field_status,field_completion_note,field_outstanding_work,field_issues,field_follow_up_required',
    )
    .eq('id', visit.id)
    .maybeSingle();
  if (currentError || !current) throw new Error('Unable to save visit report.');
  if (!visitReportSnapshotsMatch(expected, snapshotFromAppointmentRow(current))) {
    throw new Error(VISIT_REPORT_CONFLICT_MESSAGE);
  }

  const { data, error } = await applyVisitReportExpectation(
    db.from('job_appointments').update(patch).eq('id', visit.id),
    expected,
  )
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Unable to save visit report.');
  if (!data) throw new Error(VISIT_REPORT_CONFLICT_MESSAGE);

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'visit_progress_updated',
    note:
      `Visit outcome → ${built.fieldStatus}` +
      (completionNote ? ` · ${completionNote}` : '') +
      (furtherVisit ? ' · Further visit required' : ''),
  });

  revalidateVisit(visit.id, visit.job_id);
}

/** Office finalises the shared visit outcome (used when multiple technicians are assigned). */
export async function officeUpdateVisitOutcomeAction(formData: FormData) {
  const user = await requireOfficeUser();
  assertOfficeOps(user);
  const appointmentId = String(formData.get('appointment_id') || '');
  const nextStatus = String(formData.get('field_status') || '');
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) throw new Error('Invalid appointment.');
  if (!isVisitOutcomeStatus(nextStatus)) {
    throw new Error('Invalid visit outcome.');
  }

  const db = dbAdmin();
  const { data: visit, error: lookupError } = await db
    .from('job_appointments')
    .select('id,job_id,status,field_status')
    .eq('id', appointmentId)
    .maybeSingle();
  if (lookupError || !visit) throw new Error('Visit not found.');

  const completionNote = textField(formData, 'completion_note', 2000);
  const outstanding = textField(formData, 'outstanding_work', 2000);
  const issues = textField(formData, 'issues', 2000);
  const furtherVisit = String(formData.get('follow_up_required') || '') === 'yes';
  const expected = expectedVisitReportSnapshot(formData);
  const built = buildVisitReportPatch({
    fieldStatus: nextStatus,
    fields: {
      completionNote,
      outstandingWork: outstanding,
      issues,
      furtherVisitRequired: furtherVisit,
    },
    currentAppointmentStatus: visit.status,
    completedAtIso: new Date().toISOString(),
  });

  const patch: Record<string, unknown> = {
    field_status: built.fieldStatus,
    field_completion_note: built.completionNote,
    field_outstanding_work: built.outstandingWork,
    field_issues: built.issues,
    field_follow_up_required: built.furtherVisitRequired,
  };
  if (built.fieldCompletedAt) patch.field_completed_at = built.fieldCompletedAt;
  else patch.field_completed_at = null;
  if (built.appointmentStatusCompleted) patch.status = 'completed';

  const { data: current, error: currentError } = await db
    .from('job_appointments')
    .select(
      'id,field_status,field_completion_note,field_outstanding_work,field_issues,field_follow_up_required',
    )
    .eq('id', visit.id)
    .maybeSingle();
  if (currentError || !current) throw new Error('Unable to update visit outcome.');
  if (!visitReportSnapshotsMatch(expected, snapshotFromAppointmentRow(current))) {
    throw new Error(VISIT_REPORT_CONFLICT_MESSAGE);
  }

  const { data, error } = await applyVisitReportExpectation(
    db.from('job_appointments').update(patch).eq('id', visit.id),
    expected,
  )
    .select('id')
    .maybeSingle();
  if (error) throw new Error('Unable to update visit outcome.');
  if (!data) throw new Error(VISIT_REPORT_CONFLICT_MESSAGE);

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: user.id,
    action: 'visit_outcome_office_updated',
    note:
      `Office visit outcome → ${built.fieldStatus}` +
      (furtherVisit ? ' · Further visit required' : ''),
  });

  revalidateVisit(visit.id, visit.job_id);
}

export async function addTechnicianNoteAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const body = textField(formData, 'body', 4000);
  if (!body) throw new Error('Note cannot be empty.');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_notes')
    .insert({
      job_id: visit.job_id,
      appointment_id: visit.id,
      author_id: crew.id,
      visibility: 'shared',
      body,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Unable to save note.');

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'technician_note_added',
    note: body.slice(0, 240),
  });

  revalidateVisit(visit.id, visit.job_id);
}

export async function editOwnNoteAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const noteId = String(formData.get('note_id') || '');
  const body = textField(formData, 'body', 4000);
  if (!body) throw new Error('Note cannot be empty.');
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) throw new Error('Invalid note.');
  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  const db = dbAdmin();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('job_notes')
    .update({ body, edited_at: now, edited_by: crew.id, updated_at: now })
    .eq('id', noteId)
    .eq('author_id', crew.id)
    .eq('job_id', visit.job_id)
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error('Unable to edit note. You can only edit your own notes.');

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'technician_note_edited',
    note: 'Edited note ' + noteId,
  });

  revalidateVisit(visit.id, visit.job_id);
}

export async function uploadJobPhotoAction(formData: FormData) {
  const appointmentId = String(formData.get('appointment_id') || '');
  const caption = textField(formData, 'caption', 500);
  const file = formData.get('photo');
  if (!(file instanceof File) || file.size <= 0) throw new Error('Choose a photo to upload.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Photo must be 15 MB or smaller.');
  const contentType = file.type || 'application/octet-stream';
  if (!ALLOWED_PHOTO_TYPES.has(contentType)) {
    throw new Error('Use a JPEG, PNG, WebP, or HEIC photo.');
  }

  const { crew, visit } = await assertAssignedAppointment(appointmentId);
  const bytes = Buffer.from(await file.arrayBuffer());

  let uploadBytes: Uint8Array = bytes;
  let uploadType = contentType === 'image/png' ? 'image/png' : 'image/jpeg';
  let width: number | null = null;
  let height: number | null = null;
  try {
    const image = sharp(bytes, { failOn: 'none' }).rotate();
    const meta = await image.metadata();
    width = meta.width ?? null;
    height = meta.height ?? null;
    if (contentType === 'image/png') {
      uploadBytes = new Uint8Array(await image.png({ compressionLevel: 8 }).toBuffer());
      uploadType = 'image/png';
    } else {
      uploadBytes = new Uint8Array(await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer());
      uploadType = 'image/jpeg';
    }
  } catch {
    // Keep original bytes when sharp cannot decode (e.g. some HEIC inputs).
    uploadBytes = bytes;
    uploadType = contentType;
  }

  if (uploadBytes.length > MAX_PHOTO_BYTES) throw new Error('Compressed photo still exceeds size limit.');

  const id = crypto.randomUUID();
  const ext = uploadType === 'image/png' ? 'png' : uploadType === 'image/webp' ? 'webp' : 'jpg';
  const storagePath = `${visit.job_id}/${visit.id}/${crew.id}/${id}.${ext}`;
  const db = dbAdmin();

  const { error: uploadError } = await db.storage.from('job-photos').upload(storagePath, uploadBytes, {
    contentType: uploadType,
    upsert: false,
  });
  if (uploadError) throw new Error('Photo upload failed. Please try again.');

  const { data, error } = await db
    .from('job_attachments')
    .insert({
      id,
      job_id: visit.job_id,
      appointment_id: visit.id,
      uploaded_by: crew.id,
      storage_path: storagePath,
      content_type: uploadType,
      byte_size: uploadBytes.length,
      width,
      height,
      caption,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    await db.storage.from('job-photos').remove([storagePath]);
    throw new Error('Unable to save photo record.');
  }

  await db.from('job_activity').insert({
    job_id: visit.job_id,
    actor_id: crew.id,
    action: 'photo_uploaded',
    note: 'Photo ' + id + (caption ? ` · ${caption}` : ''),
  });

  revalidateVisit(visit.id, visit.job_id);
}

/** Office timesheet approval / rejection / audited correction. */
export async function reviewTimeEntryAction(formData: FormData) {
  const user = await requireOfficeUser();
  assertOfficeOps(user);
  const entryId = String(formData.get('entry_id') || '');
  const decision = String(formData.get('decision') || '');
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) throw new Error('Invalid time entry.');
  if (!['approve', 'reject', 'correct'].includes(decision)) throw new Error('Invalid decision.');

  const entry = await getTimeEntry(entryId);
  if (!entry || entry.status === 'active' || entry.status === 'on_break' || entry.status === 'cancelled') {
    throw new Error('Only submitted time entries can be reviewed.');
  }

  const db = dbAdmin();
  const now = new Date().toISOString();
  const rejectionReason = textField(formData, 'rejection_reason', 2000);
  const correctionNote = textField(formData, 'correction_note', 2000);
  const billableRaw = String(formData.get('billable_minutes') || '').trim();

  if (decision === 'approve') {
    const billable = billableRaw === '' ? entry.workedMinutes : Math.max(0, Number(billableRaw) || 0);
    const { error } = await db
      .from('job_time_entries')
      .update({
        status: 'approved',
        billable_minutes: billable,
        approved_by: user.id,
        approved_at: now,
        updated_at: now,
      })
      .eq('id', entryId)
      .in('status', ['submitted', 'rejected', 'corrected']);
    if (error) throw new Error('Unable to approve time entry.');
  } else if (decision === 'reject') {
    if (!rejectionReason) throw new Error('Rejection reason is required.');
    const { error } = await db
      .from('job_time_entries')
      .update({
        status: 'rejected',
        rejection_reason: rejectionReason,
        approved_by: user.id,
        approved_at: now,
        billable_minutes: null,
        updated_at: now,
      })
      .eq('id', entryId)
      .in('status', ['submitted', 'approved', 'corrected']);
    if (error) throw new Error('Unable to reject time entry.');
  } else {
    const startLocal = String(formData.get('started_at') || '');
    const endLocal = String(formData.get('ended_at') || '');
    const breakMinutes = Math.max(0, Math.min(24 * 60, Number(formData.get('break_minutes') || 0) || 0));
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startLocal) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endLocal)) {
      throw new Error('Enter valid corrected times.');
    }
    if (!correctionNote) throw new Error('Correction note is required for the audit trail.');
    const startedAt = new Date(startLocal + '+08:00');
    const endedAt = new Date(endLocal + '+08:00');
    if (endedAt <= startedAt) throw new Error('Corrected end must be after start.');
    const worked = computeWorkedMinutes(startedAt.toISOString(), endedAt.toISOString(), breakMinutes);
    const billable =
      billableRaw === '' ? worked : Math.max(0, Number(billableRaw) || 0);
    const { error } = await db
      .from('job_time_entries')
      .update({
        status: 'corrected',
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        break_minutes: breakMinutes,
        worked_minutes: worked,
        billable_minutes: billable,
        correction_note: correctionNote,
        corrected_by: user.id,
        corrected_at: now,
        original_started_at: entry.originalStartedAt ?? entry.startedAt,
        original_ended_at: entry.originalEndedAt ?? entry.endedAt,
        original_break_minutes: entry.originalBreakMinutes ?? entry.breakMinutes,
        original_worked_minutes: entry.originalWorkedMinutes ?? entry.workedMinutes,
        updated_at: now,
      })
      .eq('id', entryId);
    if (error) throw new Error('Unable to correct time entry.');
  }

  await db.from('job_activity').insert({
    job_id: entry.jobId,
    actor_id: user.id,
    action: 'time_' + decision + 'd',
    note: `Time entry ${entryId} ${decision}`,
  });

  if (entry.appointmentId) revalidateVisit(entry.appointmentId, entry.jobId);
  else {
    revalidatePath('/hq/jobs/' + entry.jobId);
    revalidatePath('/hq/timesheets');
  }
}

export async function addOfficeNoteAction(formData: FormData) {
  const user = await requireOfficeUser();
  assertOfficeOps(user);
  const jobId = String(formData.get('job_id') || '');
  const body = textField(formData, 'body', 4000);
  const visibility = String(formData.get('visibility') || 'office_only');
  if (!/^[0-9a-f-]{36}$/i.test(jobId) || !body) throw new Error('Invalid note.');
  if (visibility !== 'shared' && visibility !== 'office_only') throw new Error('Invalid visibility.');
  const db = dbAdmin();
  const { error } = await db.from('job_notes').insert({
    job_id: jobId,
    author_id: user.id,
    visibility,
    body,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error('Unable to save office note.');
  await db.from('job_activity').insert({
    job_id: jobId,
    actor_id: user.id,
    action: visibility === 'office_only' ? 'office_note_added' : 'note_added',
    note: body.slice(0, 240),
  });
  revalidatePath('/hq/jobs/' + jobId);
}

/** Deny technicians from approving timesheets via forged form posts. */
export async function technicianCannotApproveGuard() {
  const crew = await requireTechnicianCrew();
  const active = await getActiveTimeEntryForTechnician(crew.id);
  return active;
}

export async function requireAssignedOrDeny(appointmentId: string) {
  const crew = await requireTechnicianCrew();
  const ok = await technicianHasAppointmentAccess(crew.staffId, appointmentId);
  if (!ok) redirect('/hq/tech?denied=1');
  return crew;
}

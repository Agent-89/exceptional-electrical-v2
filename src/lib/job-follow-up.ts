/** Follow-up / further-visit attention helpers (office + technician). */

export type FollowUpAppointment = {
  id: string;
  startsAt: string;
  followUp: boolean;
  /** Present after migration; null/undefined means unresolved or column absent. */
  followUpResolvedAt?: string | null;
  followUpLinkedAppointmentId?: string | null;
  followUpResolution?: 'linked_visit' | 'office_cleared' | null;
  followUpResolutionNote?: string | null;
};

/** Outstanding when technician/office flagged follow-up and office has not resolved it. */
export function isFollowUpOutstanding(appointment: FollowUpAppointment): boolean {
  if (!appointment.followUp) return false;
  if (appointment.followUpResolvedAt) return false;
  return true;
}

export type FollowUpResolutionMode = 'office_cleared' | 'linked_visit';

export function parseFollowUpResolutionMode(value: string): FollowUpResolutionMode | null {
  if (value === 'office_cleared' || value === 'linked_visit') return value;
  return null;
}

export function validateFollowUpResolution(input: {
  mode: string;
  note: string | null;
  linkedAppointmentId: string | null;
  sourceAppointmentId: string;
  candidateAppointments: Array<{ id: string; startsAt: string; status: string }>;
  sourceStartsAt: string;
}): { ok: true; mode: FollowUpResolutionMode; linkedAppointmentId: string | null } | { ok: false; error: string } {
  const mode = parseFollowUpResolutionMode(input.mode);
  if (!mode) return { ok: false, error: 'Choose how to resolve the further visit.' };
  if (!input.note?.trim()) {
    return { ok: false, error: 'Add a short note for the audit trail.' };
  }
  if (mode === 'office_cleared') {
    return { ok: true, mode, linkedAppointmentId: null };
  }
  const linkedId = input.linkedAppointmentId;
  if (!linkedId || !/^[0-9a-f-]{36}$/i.test(linkedId)) {
    return { ok: false, error: 'Select an existing follow-up appointment to link.' };
  }
  if (linkedId === input.sourceAppointmentId) {
    return { ok: false, error: 'Link a different appointment, not the same visit.' };
  }
  const linked = input.candidateAppointments.find((a) => a.id === linkedId);
  if (!linked || linked.status === 'cancelled') {
    return { ok: false, error: 'Linked appointment was not found on this job.' };
  }
  if (new Date(linked.startsAt).getTime() < new Date(input.sourceStartsAt).getTime()) {
    return {
      ok: false,
      error: 'Linked follow-up should start on or after the flagged visit.',
    };
  }
  return { ok: true, mode, linkedAppointmentId: linkedId };
}

export function formatFollowUpResolutionActivityNote(input: {
  mode: FollowUpResolutionMode;
  visitLabel: string;
  note: string;
  linkedLabel?: string | null;
}): string {
  if (input.mode === 'linked_visit') {
    return `Further visit resolved for ${input.visitLabel} by linking ${input.linkedLabel || 'a follow-up appointment'}. ${input.note}`;
  }
  return `Further visit marked resolved for ${input.visitLabel}. ${input.note}`;
}

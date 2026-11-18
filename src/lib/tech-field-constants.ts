export const FIELD_STATUSES = [
  'scheduled',
  'in_progress',
  'paused',
  'work_completed',
  'unable_to_complete',
] as const;

export type FieldStatus = (typeof FIELD_STATUSES)[number];

export const FIELD_STATUS_LABELS: Record<FieldStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  paused: 'Paused',
  work_completed: 'Visit completed',
  unable_to_complete: 'Unable to complete',
};

export function isFieldStatus(value: string): value is FieldStatus {
  return (FIELD_STATUSES as readonly string[]).includes(value);
}

/** Prefer live field ops status; fall back to scheduling visit status. */
export function fieldVisitStatusLabel(
  fieldStatus?: string | null,
  visitStatus?: string | null,
): string {
  if (fieldStatus && fieldStatus !== 'scheduled') {
    if (isFieldStatus(fieldStatus)) return FIELD_STATUS_LABELS[fieldStatus];
    return fieldStatus.replaceAll('_', ' ');
  }
  if (visitStatus) {
    if (isFieldStatus(visitStatus)) return FIELD_STATUS_LABELS[visitStatus];
    return visitStatus.replaceAll('_', ' ');
  }
  return FIELD_STATUS_LABELS.scheduled;
}

/** Chip modifier for calendar / card status pills. */
export function fieldStatusChipModifier(fieldStatus?: string | null): string {
  switch (fieldStatus) {
    case 'in_progress':
      return 'is-in-progress';
    case 'paused':
      return 'is-paused';
    case 'work_completed':
      return 'is-done';
    case 'unable_to_complete':
      return 'is-unable';
    default:
      return 'is-scheduled';
  }
}

export const ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

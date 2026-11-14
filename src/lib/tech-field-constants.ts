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

export const ALLOWED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

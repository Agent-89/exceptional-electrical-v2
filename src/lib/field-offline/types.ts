/** Field offline MVP types — snapshots + mutation outbox (no photo blobs). */

export type FieldOutboxActionType =
  | 'start_work'
  | 'pause_work'
  | 'resume_work'
  | 'finish_work'
  | 'add_note'
  | 'update_progress';

export type FieldOutboxItem = {
  id: string;
  createdAt: string;
  staffId: string;
  appointmentId: string;
  action: FieldOutboxActionType;
  /** Serialized form fields (string values only). */
  payload: Record<string, string>;
  attempts: number;
  lastError: string | null;
};

export type FieldDayVisitSnapshot = {
  appointmentId: string;
  startsAt: string;
  endsAt: string;
  title: string;
  jobNumber: string;
  customerName: string;
  visitStatus: string;
  fieldStatus: string;
  siteAddress: string;
};

export type FieldTodaySnapshot = {
  staffId: string;
  crewName: string;
  dayKey: string;
  savedAt: string;
  visits: FieldDayVisitSnapshot[];
};

export type FieldVisitSnapshot = {
  staffId: string;
  appointmentId: string;
  savedAt: string;
  /** Opaque JSON for offline read-only display; pages choose fields. */
  summary: {
    title: string;
    jobNumber: string;
    customerName: string;
    siteAddress: string;
    scheduledLabel: string;
    fieldStatus: string;
    electricianNames: string[];
  };
};

export const FIELD_OFFLINE_DB = 'ee-field-offline';
export const FIELD_OFFLINE_VERSION = 1;
export const FIELD_STORE_TODAY = 'today';
export const FIELD_STORE_VISITS = 'visits';
export const FIELD_STORE_OUTBOX = 'outbox';

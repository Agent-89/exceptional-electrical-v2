import type { FieldOutboxActionType, FieldOutboxItem } from './types';

export function createOutboxItem(args: {
  staffId: string;
  appointmentId: string;
  action: FieldOutboxActionType;
  payload: Record<string, string>;
  now?: Date;
  id?: string;
}): FieldOutboxItem {
  const now = args.now ?? new Date();
  return {
    id: args.id ?? `outbox_${now.getTime()}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: now.toISOString(),
    staffId: args.staffId,
    appointmentId: args.appointmentId,
    action: args.action,
    payload: { ...args.payload },
    attempts: 0,
    lastError: null,
  };
}

export function formDataToPayload(formData: FormData): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') payload[key] = value;
  }
  return payload;
}

export function payloadToFormData(payload: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    fd.set(key, value);
  }
  return fd;
}

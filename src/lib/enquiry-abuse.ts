/** Pure helpers for public enquiry intake abuse controls (no DB/secrets). */

/** Cooldown window for same email or phone resubmits. */
export const ENQUIRY_COOLDOWN_MS = 15 * 60 * 1000;

export const ENQUIRY_COOLDOWN_MESSAGE =
  'An enquiry was already submitted recently with these details. Please wait a little before trying again.';

export function normalizeEnquiryEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Digits-only phone fingerprint for cooldown matching. */
export function normalizeEnquiryPhone(phone: string): string {
  return phone.replace(/\D+/g, '');
}

export function enquiryCooldownCutoffIso(
  nowMs: number = Date.now(),
  windowMs: number = ENQUIRY_COOLDOWN_MS,
): string {
  return new Date(nowMs - windowMs).toISOString();
}

export function isWithinEnquiryCooldown(args: {
  lastSubmissionAt: string | null | undefined;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  if (!args.lastSubmissionAt) return false;
  const at = Date.parse(args.lastSubmissionAt);
  if (!Number.isFinite(at)) return false;
  const now = args.nowMs ?? Date.now();
  const windowMs = args.windowMs ?? ENQUIRY_COOLDOWN_MS;
  return now - at < windowMs;
}

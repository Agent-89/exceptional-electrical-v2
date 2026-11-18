import { timingSafeEqual } from 'node:crypto';

/** Constant-time compare for the Edge Function → Next.js internal secret. */
export function pushInternalSecretMatches(
  provided: string | null,
  expected = process.env.HQ_PUSH_INTERNAL_SECRET || '',
): boolean {
  if (!expected || expected.length < 24 || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

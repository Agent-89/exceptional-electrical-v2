/**
 * Guards for optional --local-db dry-run compare.
 * Hosted Supabase must never be targeted by the dry-run CLI.
 */

const LOCAL_SUPABASE_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function isLocalSupabaseUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (!LOCAL_SUPABASE_HOSTS.has(host)) return false;
  // Default local API port; allow explicit local ports only.
  const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
  return port === '54321' || port === '54322';
}

export function assertLocalSupabaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('Local Supabase URL is empty. Refusing dry-run DB compare.');
  }
  if (!isLocalSupabaseUrl(trimmed)) {
    throw new Error(
      `Refusing dry-run DB compare against non-local Supabase URL. Only http://127.0.0.1:54321 (or localhost/[::1] :54321/:54322) is allowed.`,
    );
  }
  return trimmed;
}

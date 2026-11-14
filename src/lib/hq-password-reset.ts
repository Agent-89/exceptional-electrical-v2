/** HQ password recovery helpers — keep redirect targets tightly allowlisted. */

export const HQ_PASSWORD_RESET_PATH = '/hq/login/reset';

const PRODUCTION_HOSTS = new Set([
  'exceptional-electrical-v2.vercel.app',
]);

/** Preview hosts for this Vercel project (branch + deployment aliases). */
const PREVIEW_HOST_RE =
  /^exceptional-electrical-v2(?:-git-[a-z0-9-]+)?-bbdhicks-5600s-projects\.vercel\.app$/i;

export function isLocalAuthHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function isAllowedHqOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (isLocalAuthHost(url.hostname)) {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }

  if (url.protocol !== 'https:') return false;
  if (PRODUCTION_HOSTS.has(url.hostname)) return true;
  if (PREVIEW_HOST_RE.test(url.hostname)) return true;

  const configured = process.env.NEXT_PUBLIC_HQ_ORIGIN?.trim();
  if (configured) {
    try {
      if (new URL(configured).origin === url.origin) return true;
    } catch {
      /* ignore invalid env */
    }
  }

  return false;
}

/** Build an absolute reset URL only when the request origin is allowlisted. */
export function resolvePasswordResetRedirect(requestOrigin: string | null | undefined): string | null {
  if (!requestOrigin) return null;
  if (!isAllowedHqOrigin(requestOrigin)) return null;
  return new URL(HQ_PASSWORD_RESET_PATH, requestOrigin).toString();
}

export function originFromRequestHeaders(input: {
  host: string | null;
  forwardedHost: string | null;
  forwardedProto: string | null;
}): string | null {
  const host = (input.forwardedHost || input.host || '').split(',')[0]?.trim();
  if (!host) return null;
  const proto =
    input.forwardedProto?.split(',')[0]?.trim() ||
    (isLocalAuthHost(host.split(':')[0] || host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 10 && password.length <= 128;
}

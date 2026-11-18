import { canAccessFieldPortal, isTechnicianRole } from './hq-roles.ts';

export const FIELD_HOME_PATH = '/field';
export const HQ_HOME_PATH = '/hq';

export function fieldHomePath(): string {
  return FIELD_HOME_PATH;
}

/** True for relative paths under /field or /hq (no open redirects). */
export function sanitizeReturnPath(next: string | null | undefined): string | null {
  if (!next) return null;
  const value = next.trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('://')) return null;
  // Legacy Field URLs — rewrite before accepting general /hq paths.
  if (value === '/hq/tech' || value.startsWith('/hq/tech/')) {
    return value.replace(/^\/hq\/tech/, '/field') || '/field';
  }
  if (value.startsWith('/field') || value.startsWith('/hq')) return value;
  return null;
}

export function isFieldReturnPath(path: string | null | undefined): boolean {
  const safe = sanitizeReturnPath(path);
  return Boolean(safe && (safe === '/field' || safe.startsWith('/field/')));
}

/**
 * Where to send the user after login or session refresh.
 * Technicians never land on office HQ. Office users honour a safe Field `next`.
 */
export function resolvePostAuthPath(args: { role: string; next?: string | null }): string {
  const safeNext = sanitizeReturnPath(args.next);
  if (isTechnicianRole(args.role)) {
    if (safeNext && isFieldReturnPath(safeNext)) return safeNext;
    return FIELD_HOME_PATH;
  }
  if (safeNext && isFieldReturnPath(safeNext) && canAccessFieldPortal(args.role)) {
    return safeNext;
  }
  if (safeNext && safeNext.startsWith('/hq')) {
    return safeNext === '/hq/login' || safeNext.startsWith('/hq/login/') ? HQ_HOME_PATH : safeNext;
  }
  return HQ_HOME_PATH;
}

export function loginPathForReturn(next?: string | null): string {
  return isFieldReturnPath(next) ? '/field/login' : '/hq/login';
}

export function sessionRefreshPath(currentPath?: string | null): string {
  const safe = sanitizeReturnPath(currentPath) || HQ_HOME_PATH;
  return `/hq/session?next=${encodeURIComponent(safe)}`;
}

/** Shared HQ role helpers. Safe for client or server imports (no secrets). */

export const HQ_ROLES = ['owner', 'admin', 'office', 'technician'] as const;
export type HqRole = (typeof HQ_ROLES)[number];

export const OFFICE_ROLES = ['owner', 'admin', 'office'] as const;
export type OfficeRole = (typeof OFFICE_ROLES)[number];

export const ADMIN_ROLES = ['owner', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isHqRole(value: string): value is HqRole {
  return (HQ_ROLES as readonly string[]).includes(value);
}

export function isOfficeRole(role: string): role is OfficeRole {
  return (OFFICE_ROLES as readonly string[]).includes(role);
}

export function isTechnicianRole(role: string): boolean {
  return role === 'technician';
}

export function isAdminRole(role: string): role is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

/** Office can mutate jobs, schedule, enquiries, customers, quote drafts. */
export function canManageOfficeOps(role: string): boolean {
  return isOfficeRole(role);
}

/** Owner/admin-only capabilities (quote approve, Google Calendar manage). */
export function canManageAdminOps(role: string): boolean {
  return isAdminRole(role);
}

export function hqHomePath(role: string): string {
  return isTechnicianRole(role) ? '/hq/tech' : '/hq';
}

export const TECH_NAV_ITEMS = [
  { href: '/hq/tech', label: 'Today' },
  { href: '/hq/tech/jobs', label: 'My Jobs' },
  { href: '/hq/tech/account', label: 'Account' },
] as const;

export const OFFICE_NAV_ITEMS = [
  { href: '/hq', label: 'Home' },
  { href: '/hq/enquiries', label: 'Enquiries' },
  { href: '/hq/customers', label: 'Customers' },
  { href: '/hq/quotes', label: 'Quotes' },
  { href: '/hq/jobs', label: 'Jobs' },
] as const;

export const OFFICE_DRAWER_EXTRA = { href: '/hq/schedule', label: 'Schedule' } as const;

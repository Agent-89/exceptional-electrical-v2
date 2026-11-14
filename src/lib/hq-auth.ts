import 'server-only';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import {
  canManageAdminOps,
  canManageOfficeOps,
  hqHomePath,
  isTechnicianRole,
  type HqRole,
} from '@/lib/hq-roles';
import {
  interpretSchedulingStaffRows,
  type SchedulingStaffLink,
} from '@/lib/scheduling-staff-link';
export type { SchedulingStaffLink };

/** Block accidental use of hosted Supabase while developing locally. */
export function assertDevSupabaseTarget(url: string) {
  if (process.env.NODE_ENV === 'production') return;
  if (process.env.ALLOW_HOSTED_SUPABASE === '1') return;
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('Invalid NEXT_PUBLIC_SUPABASE_URL');
  }
  if (host === '127.0.0.1' || host === 'localhost') return;
  throw new Error(
    'Refusing hosted Supabase in development. Use http://127.0.0.1:54321 or set ALLOW_HOSTED_SUPABASE=1.',
  );
}

export function dbAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Supabase server configuration missing');
  assertDevSupabaseTarget(url);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type HqUser = {
  id: string;
  email: string;
  name: string;
  role: HqRole;
};

export async function hqUser(): Promise<HqUser | null> {
  const jar = await cookies();
  const token = jar.get('ee_hq_access')?.value;
  if (!token) return null;
  const db = dbAdmin();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user) {
    if (jar.get('ee_hq_refresh')?.value) redirect('/hq/session');
    return null;
  }
  const { data: staff } = await db
    .from('staff_profiles')
    .select('user_id,full_name,role,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (!staff) return null;
  const role = staff.role as string;
  if (
    role !== 'owner' &&
    role !== 'admin' &&
    role !== 'office' &&
    role !== 'technician'
  ) {
    return null;
  }
  return { id: user.id, email: user.email ?? '', name: staff.full_name, role };
}

export async function requireHqUser(): Promise<HqUser> {
  const user = await hqUser();
  if (!user) redirect('/hq/login');
  return user;
}

/** Office HQ surfaces — technicians are redirected to their Today screen. */
export async function requireOfficeUser(): Promise<HqUser> {
  const user = await requireHqUser();
  if (isTechnicianRole(user.role)) redirect('/hq/tech');
  return user;
}

export function assertOfficeOps(user: HqUser): void {
  if (!canManageOfficeOps(user.role)) {
    throw new Error('Insufficient permissions');
  }
}

export function assertAdminOps(user: HqUser): void {
  if (!canManageAdminOps(user.role)) {
    throw new Error('Insufficient permissions');
  }
}

/**
 * Resolve login identity → crew directory row.
 * staff_profiles.user_id → scheduling_staff.auth_user_id → scheduling_staff.id
 */
export async function resolveSchedulingStaff(authUserId: string): Promise<SchedulingStaffLink> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('scheduling_staff')
    .select('id,full_name,active')
    .eq('auth_user_id', authUserId)
    .limit(5);
  if (error) throw new Error('Unable to resolve scheduling staff identity.');
  return interpretSchedulingStaffRows(
    (data ?? []).map((row) => ({
      id: row.id as string,
      full_name: row.full_name as string,
      active: Boolean(row.active),
    })),
  );
}

export type TechnicianCrew = HqUser & { staffId: string; crewName: string };

/**
 * Technician pages require an active, uniquely mapped scheduling_staff row.
 * Fail closed with a dedicated setup screen when mapping is missing/invalid.
 */
export async function requireTechnicianCrew(): Promise<TechnicianCrew> {
  const user = await requireHqUser();
  if (!isTechnicianRole(user.role)) redirect(hqHomePath(user.role));
  const link = await resolveSchedulingStaff(user.id);
  if (!link.ok) redirect('/hq/tech/account?setup=' + link.reason);
  return { ...user, staffId: link.staffId, crewName: link.fullName };
}

/** True when this crew member is assigned to the appointment via job_appointment_staff. */
export async function technicianHasAppointmentAccess(
  staffId: string,
  appointmentId: string,
): Promise<boolean> {
  const db = dbAdmin();
  const { data, error } = await db
    .from('job_appointment_staff')
    .select('appointment_id')
    .eq('appointment_id', appointmentId)
    .eq('staff_id', staffId)
    .maybeSingle();
  if (error) throw new Error('Unable to verify appointment access.');
  return Boolean(data);
}

export async function requireTechnicianAppointmentAccess(
  appointmentId: string,
): Promise<TechnicianCrew> {
  const crew = await requireTechnicianCrew();
  const allowed = await technicianHasAppointmentAccess(crew.staffId, appointmentId);
  if (!allowed) redirect('/hq/tech?denied=1');
  return crew;
}

'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { dbAdmin } from '@/lib/hq-auth';
import {
  isStrongPassword,
  originFromRequestHeaders,
  resolvePasswordResetRedirect,
} from '@/lib/hq-password-reset';

async function currentAllowlistedResetRedirect(): Promise<string> {
  const h = await headers();
  const origin = originFromRequestHeaders({
    host: h.get('host'),
    forwardedHost: h.get('x-forwarded-host'),
    forwardedProto: h.get('x-forwarded-proto'),
  });
  const redirectTo = resolvePasswordResetRedirect(origin);
  if (!redirectTo) {
    throw new Error('Password recovery is not available from this host.');
  }
  return redirectTo;
}

/** Send a recovery email that returns to this deployment's reset page. */
export async function requestPasswordResetAction(form: FormData) {
  const email = String(form.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email || !email.includes('@')) {
    redirect('/hq/login/reset?error=email');
  }

  const redirectTo = await currentAllowlistedResetRedirect().catch(() => null);
  if (!redirectTo) redirect('/hq/login/reset?error=host');

  const db = dbAdmin();
  // Always show the same success state to avoid account enumeration.
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    // Do not leak whether the email exists; still send the user onward.
    console.error('Password recovery email request failed', error.name);
  }
  redirect('/hq/login/reset?sent=1');
}

/**
 * Complete recovery using the short-lived access token from the email redirect hash.
 * Tokens are accepted over HTTPS form POST only and never logged.
 */
export async function completePasswordResetAction(form: FormData) {
  const accessToken = String(form.get('access_token') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const confirm = String(form.get('confirm_password') ?? '');

  if (!accessToken) redirect('/hq/login/reset?error=invalid');
  if (!isStrongPassword(password)) redirect('/hq/login/reset?error=password');
  if (password !== confirm) redirect('/hq/login/reset?error=match');

  const db = dbAdmin();
  const {
    data: { user },
    error,
  } = await db.auth.getUser(accessToken);
  if (error || !user) redirect('/hq/login/reset?error=invalid');

  const { data: staff } = await db
    .from('staff_profiles')
    .select('user_id,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (!staff) redirect('/hq/login/reset?error=access');

  const { error: updateError } = await db.auth.admin.updateUserById(user.id, { password });
  if (updateError) {
    console.error('Password recovery update failed', updateError.name);
    redirect('/hq/login/reset?error=update');
  }

  redirect('/hq/login?reset=ok');
}

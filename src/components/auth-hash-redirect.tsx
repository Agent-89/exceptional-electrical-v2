'use client';

import { useEffect } from 'react';

/**
 * If an Auth recovery/invite link lands on the marketing site with tokens in the
 * URL hash (common when Supabase Site URL is still localhost/root), forward to
 * the HQ reset page without logging token values.
 */
export default function AuthHashRedirect() {
  useEffect(() => {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const type = params.get('type');
    const hasToken = Boolean(params.get('access_token') || params.get('error'));
    if (!hasToken) return;
    if (type && type !== 'recovery' && type !== 'invite' && type !== 'magiclink') return;
    if (window.location.pathname.startsWith('/hq/login/reset')) return;
    window.location.replace('/hq/login/reset#' + hash);
  }, []);
  return null;
}

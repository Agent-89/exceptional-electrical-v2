'use client';

import { useEffect, useMemo, useState } from 'react';
import { completePasswordResetAction, requestPasswordResetAction } from './actions';

type Mode = 'request' | 'set' | 'invalid';

function readRecoveryAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const params = new URLSearchParams(hash);
  const type = params.get('type');
  const accessToken = params.get('access_token');
  const error = params.get('error') || params.get('error_code');
  if (error) return null;
  if (accessToken && (!type || type === 'recovery')) return accessToken;
  return null;
}

function clearHashFromUrl() {
  if (typeof window === 'undefined') return;
  const url = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', url);
}

export default function ResetClient({
  initialError,
  sent,
}: {
  initialError?: string;
  sent?: boolean;
}) {
  const [mode, setMode] = useState<Mode>('request');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    const token = readRecoveryAccessToken();
    if (token) {
      setAccessToken(token);
      setMode('set');
      clearHashFromUrl();
      return;
    }
    if (window.location.hash.includes('error') || window.location.search.includes('error=invalid')) {
      setMode('invalid');
      clearHashFromUrl();
    }
  }, []);

  const banner = useMemo(() => {
    if (sent) return { kind: 'ok' as const, text: 'If that email is registered for HQ, a reset link is on its way.' };
    if (initialError === 'email') return { kind: 'err' as const, text: 'Enter a valid email address.' };
    if (initialError === 'host')
      return { kind: 'err' as const, text: 'Password recovery is not available from this host.' };
    if (initialError === 'password')
      return { kind: 'err' as const, text: 'Choose a password of at least 10 characters.' };
    if (initialError === 'match') return { kind: 'err' as const, text: 'Passwords do not match.' };
    if (initialError === 'invalid')
      return { kind: 'err' as const, text: 'This reset link is invalid or has expired. Request a new one.' };
    if (initialError === 'access')
      return { kind: 'err' as const, text: 'This account is not approved for HQ access.' };
    if (initialError === 'update')
      return { kind: 'err' as const, text: 'Unable to update password. Request a new reset link.' };
    if (mode === 'invalid')
      return { kind: 'err' as const, text: 'This reset link is invalid or has expired. Request a new one.' };
    return null;
  }, [initialError, mode, sent]);

  return (
    <>
      {banner ? (
        <div role={banner.kind === 'err' ? 'alert' : 'status'} className="hq-alert" style={{ marginBottom: 18 }}>
          {banner.text}
        </div>
      ) : null}

      {mode === 'set' && accessToken ? (
        <form action={completePasswordResetAction}>
          <input type="hidden" name="access_token" value={accessToken} />
          <label htmlFor="hq-reset-password">
            New password
            <input
              id="hq-reset-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              placeholder="At least 10 characters"
            />
          </label>
          <label htmlFor="hq-reset-confirm">
            Confirm password
            <input
              id="hq-reset-confirm"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              placeholder="Re-enter password"
            />
          </label>
          <button className="hq-primary hq-login-submit" type="submit">
            <span>Save new password</span>
          </button>
        </form>
      ) : (
        <form action={requestPasswordResetAction}>
          <label htmlFor="hq-reset-email">
            Email address
            <input
              id="hq-reset-email"
              name="email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="username"
              placeholder="you@example.com"
              required
            />
          </label>
          <button className="hq-primary hq-login-submit" type="submit">
            <span>Send reset link</span>
          </button>
        </form>
      )}
    </>
  );
}

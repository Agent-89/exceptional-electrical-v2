import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import LoginForm from '@/app/hq/login/login-form';
import { sanitizeReturnPath } from '@/lib/hq-return-path';
import '@/app/hq/hq.css';

export const dynamic = 'force-dynamic';

export default async function FieldLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string; next?: string }>;
}) {
  const { error, reset, next } = await searchParams;
  const safeNext = sanitizeReturnPath(next) || '/field';
  const fieldNext = safeNext.startsWith('/field') ? safeNext : '/field';

  return (
    <main className="hq-login hq-login-premium hq-login-refined">
      <div className="hq-login-ambient" aria-hidden="true" />
      <div className="hq-login-layout">
        <section className="hq-login-card" aria-labelledby="field-login-title">
          <div className="hq-login-card-brand">
            <Image
              src="/exceptional-electrical-logo.png"
              alt="Exceptional Electrical"
              width={270}
              height={100}
              priority
              unoptimized
            />
            <span>Field</span>
          </div>
          <h1 id="field-login-title">
            Welcome back<span>.</span>
          </h1>
          <p>Sign in to Exceptional Field.</p>
          {reset === 'ok' && (
            <div role="status" className="hq-alert">
              Password updated. Sign in with your new password.
            </div>
          )}
          {error && (
            <div role="alert" className="hq-alert">
              {error === 'access'
                ? 'This account has not been approved for Field access.'
                : 'Email or password not recognised.'}
            </div>
          )}
          <LoginForm
            next={fieldNext}
            submitLabel="Sign in to Field"
            resetHref="/hq/login/reset"
          />
          <div className="hq-login-secure">
            <ShieldCheck size={17} aria-hidden="true" /> Authorised Exceptional Electrical staff only
          </div>
        </section>
        <div className="hq-login-footer">
          <Link href="/hq/login">Office HQ sign-in</Link>
        </div>
      </div>
    </main>
  );
}

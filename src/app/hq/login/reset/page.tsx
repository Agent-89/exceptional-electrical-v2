import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import ResetClient from './reset-client';
import '../../hq.css';

export const dynamic = 'force-dynamic';

export default async function PasswordResetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;
  return (
    <main className="hq-login hq-login-premium hq-login-refined">
      <div className="hq-login-ambient" aria-hidden="true" />
      <div className="hq-login-layout">
        <section className="hq-login-card" aria-labelledby="hq-reset-title">
          <div className="hq-login-card-brand">
            <Image
              src="/exceptional-electrical-logo.png"
              alt="Exceptional Electrical"
              width={270}
              height={100}
              priority
              unoptimized
            />
            <span>HQ</span>
          </div>
          <h1 id="hq-reset-title">
            Reset password<span>.</span>
          </h1>
          <p>Choose a new password for your HQ account, or request a fresh reset link.</p>
          <ResetClient initialError={error} sent={sent === '1'} />
          <div className="hq-login-secure">
            <ShieldCheck size={17} aria-hidden="true" /> Authorised Exceptional Electrical staff only
          </div>
        </section>
        <div className="hq-login-footer">
          <Link href="/hq/login">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}

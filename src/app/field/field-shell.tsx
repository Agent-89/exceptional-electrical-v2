'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { CalendarCheck2, CircleUserRound, LogOut, Menu, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { logoutAction } from '@/app/hq/actions';
import type { HqRole } from '@/lib/hq-roles';
import FieldOfflineChrome from './field-offline-chrome';

const HQ_LOGO = '/exceptional-electrical-logo-hq.webp';
const FIELD_STARTUP_LOGO = '/exceptional-electrical-logo-white.webp';

const fieldItems = [
  { href: '/field', label: 'Today', icon: CalendarCheck2 },
  { href: '/field/jobs', label: 'My Jobs', icon: Wrench },
  { href: '/field/account', label: 'Account', icon: CircleUserRound },
];

export default function FieldShell({
  children,
}: {
  children: React.ReactNode;
  role?: HqRole | null;
}) {
  const pathname = usePathname();
  const items = fieldItems;
  const [menu, setMenu] = useState(false);
  const [showStartup, setShowStartup] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShowStartup(false);
      return;
    }
    try {
      if (sessionStorage.getItem('ee-field-startup-seen')) {
        setShowStartup(false);
        return;
      }
      sessionStorage.setItem('ee-field-startup-seen', '1');
    } catch {
      /* Still show the opening on storage-restricted browsers. */
    }
    const timer = setTimeout(() => setShowStartup(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => setMenu(false), [pathname]);

  if (pathname === '/field/login' || pathname.startsWith('/field/login/')) {
    return <>{children}</>;
  }

  const active = (href: string) => {
    if (href === '/field') return pathname === '/field';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <div className="hq-shell hq-shell-tech">
      {showStartup && (
        <div
          className="hq-startup field-startup"
          role="status"
          aria-label="Opening Exceptional Electrical Field"
          onClick={() => setShowStartup(false)}
        >
          <div className="hq-startup-brand">
            <div className="hq-startup-mark">
              <Image className="hq-startup-outline" src={FIELD_STARTUP_LOGO} alt="" width={240} height={80} priority />
              <div className="hq-startup-fill" aria-hidden="true">
                <Image src={FIELD_STARTUP_LOGO} alt="" width={240} height={80} priority />
              </div>
            </div>
            <strong>EXCEPTIONAL ELECTRICAL</strong>
            <span>FIELD</span>
          </div>
        </div>
      )}
      <header className="hq-shell-header">
        <button
          type="button"
          className="hq-shell-icon-button"
          aria-label="Open navigation menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
        >
          <Menu size={23} strokeWidth={2} />
        </button>
        <Link href="/field" className="hq-shell-logo" aria-label="Exceptional Field home">
          <Image src={HQ_LOGO} alt="Exceptional Electrical" width={240} height={80} priority />
        </Link>
        <span className="hq-shell-header-spacer" aria-hidden="true" />
      </header>

      <button
        className={`hq-shell-scrim${menu ? ' is-open' : ''}`}
        aria-label="Close navigation menu"
        tabIndex={menu ? 0 : -1}
        aria-hidden={!menu}
        onClick={() => setMenu(false)}
      />
      <aside
        className={`hq-shell-drawer${menu ? ' is-open' : ''}`}
        aria-label="Field menu"
        aria-hidden={!menu}
        inert={!menu}
      >
        <div className="hq-shell-drawer-heading">
          <Link href="/field" className="hq-shell-drawer-brand" aria-label="Exceptional Field home">
            <Image src={HQ_LOGO} alt="Exceptional Electrical" width={180} height={60} />
            <span>Field</span>
          </Link>
          <button onClick={() => setMenu(false)} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>
        <nav>
          {items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={active(item.href) ? 'page' : undefined}>
              <item.icon size={19} strokeWidth={1.9} aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <form action={logoutAction} className="hq-shell-logout-form">
          <input type="hidden" name="next" value="/field" />
          <button type="submit" className="hq-shell-logout">
            <LogOut size={19} strokeWidth={1.9} aria-hidden="true" />
            <span>Log out</span>
          </button>
        </form>
      </aside>

      <div className="hq-shell-content" id="hq-main-content">
        <FieldOfflineChrome />
        {children}
      </div>

      <nav className="hq-shell-bottom" aria-label="Field sections">
        {items.map((item) => (
          <Link key={item.href} href={item.href} prefetch aria-current={active(item.href) ? 'page' : undefined}>
            <span aria-hidden="true" className="hq-shell-nav-icon">
              <item.icon size={22} strokeWidth={1.9} />
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

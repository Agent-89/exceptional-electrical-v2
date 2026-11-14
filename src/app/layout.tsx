import type { Metadata } from 'next';
import AuthHashRedirect from '@/components/auth-hash-redirect';
import './globals.css';
export const metadata: Metadata = { title: 'Electrician Perth | Exceptional Electrical Services', description: 'Perth electrician for residential and commercial electrical work, lighting, switchboard upgrades, EV charger installation and maintenance. Contact Exceptional Electrical.' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en-AU"><body><AuthHashRedirect/>{children}</body></html>; }

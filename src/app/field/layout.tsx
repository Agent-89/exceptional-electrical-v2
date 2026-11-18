import type { Metadata, Viewport } from 'next';
import { hqUser } from '@/lib/hq-auth';
import FieldPwaRegister from './pwa-register';
import FieldShell from './field-shell';
import '@/app/hq/hq.css';

export const metadata: Metadata = {
  title: { default: 'Exceptional Field', template: '%s | Exceptional Field' },
  description: 'Exceptional Electrical field visits, time, and notes.',
  applicationName: 'Exceptional Field',
  manifest: '/field/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'EE Field', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/field/icon.png?size=192&v=5', type: 'image/png', sizes: '192x192' },
      { url: '/field/icon.png?size=512&v=5', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/field/icon.png?size=512&v=5', sizes: '512x512', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#071625',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default async function FieldLayout({ children }: { children: React.ReactNode }) {
  const user = await hqUser();
  return (
    <>
      <FieldPwaRegister />
      <FieldShell role={user?.role ?? null}>{children}</FieldShell>
    </>
  );
}

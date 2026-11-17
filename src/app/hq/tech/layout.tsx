import type { Metadata, Viewport } from 'next';
import FieldOfflineChrome from './field-offline-chrome';

export const metadata: Metadata = {
  title: { default: 'Exceptional Field', template: '%s | Exceptional Field' },
  description: 'Exceptional Electrical field visits, time, and notes.',
  applicationName: 'Exceptional Field',
  manifest: '/hq/tech/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'EE Field', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/hq/icon.png?size=192&v=4', type: 'image/png', sizes: '192x192' },
      { url: '/hq/icon.png?size=512&v=4', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/hq/icon.png?size=512&v=4', sizes: '512x512', type: 'image/png' }],
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

/** Field surface metadata override; shell + SW register come from parent HQ layout. */
export default function TechLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FieldOfflineChrome />
      {children}
    </>
  );
}

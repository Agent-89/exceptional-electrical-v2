import { NextResponse } from 'next/server';

/** Field installable PWA — separate from office HQ, shared login cookies. */
export function GET() {
  return NextResponse.json(
    {
      id: '/field',
      name: 'Exceptional Field',
      short_name: 'EE Field',
      description: 'Exceptional Electrical field visits, time, and notes',
      start_url: '/field',
      scope: '/field/',
      display: 'standalone',
      background_color: '#071625',
      theme_color: '#071625',
      icons: [
        { src: '/field/icon.png?size=192&v=5', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/field/icon.png?size=512&v=5', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/field/icon.png?size=512&v=5', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json; charset=utf-8',
        'Cache-Control': 'public, no-store',
      },
    },
  );
}

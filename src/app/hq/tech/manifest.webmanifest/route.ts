import { NextResponse } from 'next/server';

/** Field installable PWA — same origin/login as HQ, distinct home-screen identity. */
export function GET() {
  return NextResponse.json(
    {
      id: '/hq/tech',
      name: 'Exceptional Field',
      short_name: 'EE Field',
      description: 'Exceptional Electrical field visits, time, and notes',
      start_url: '/hq/tech',
      scope: '/hq/',
      display: 'standalone',
      background_color: '#071625',
      theme_color: '#071625',
      icons: [
        { src: '/hq/icon.png?size=192&v=4', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/hq/icon.png?size=512&v=4', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/hq/icon.png?size=512&v=4', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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

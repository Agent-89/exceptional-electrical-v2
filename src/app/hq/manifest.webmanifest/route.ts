import { NextResponse } from 'next/server';

/** Office HQ installable PWA — distinct from Field (`/field`). */
export function GET() {
  return NextResponse.json(
    {
      id: '/hq',
      name: 'Exceptional Electrical HQ',
      short_name: 'Electrical HQ',
      description: 'Exceptional Electrical staff operations',
      start_url: '/hq',
      scope: '/hq',
      display: 'standalone',
      background_color: '#f2f6fb',
      theme_color: '#f2f6fb',
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

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const runtime = 'nodejs';

function parseSize(request: Request): number {
  try {
    const raw = new URL(request.url).searchParams.get('size');
    if (raw === '192') return 192;
    if (raw === '512') return 512;
  } catch {
    /* default */
  }
  return 512;
}

export async function GET(request: Request) {
  const size = parseSize(request);
  const source = await readFile(path.join(process.cwd(), 'public', 'exceptional-electrical-logo.png'));
  const meta = await sharp(source).metadata();
  const width = meta.width || 512;
  const height = meta.height || 512;
  // Crop around the plug head and short cable, not the long wordmark/cable tail.
  const cropWidth = Math.min(width, Math.max(1, Math.round(width * 0.255)));
  const cropHeight = Math.min(height, Math.max(1, Math.round(height * 0.78)));
  const plug = await sharp(source)
    .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 16 })
    .png()
    .toBuffer();
  const inner = Math.max(1, Math.round(size * (456 / 512)));
  const pad = Math.max(0, Math.round((size - inner) / 2));
  const png = await sharp(plug)
    .resize(inner, inner, { fit: 'contain', background: '#ffffff' })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#ffffff' })
    .resize(size, size)
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=3600' },
  });
}

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const runtime = 'nodejs';

const FIELD_BG = '#071625';

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

/** Turn non-white logo pixels into opaque white; white background becomes transparent. */
async function whitePlugOnTransparent(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const brightness = (r + g + b) / 3;
    if (brightness > 245) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = 0;
    } else {
      // Preserve soft edges from anti-aliasing against white.
      const alpha = Math.max(0, Math.min(255, Math.round((255 - brightness) * 1.15)));
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = alpha;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

export async function GET(request: Request) {
  const size = parseSize(request);
  const source = await readFile(path.join(process.cwd(), 'public', 'exceptional-electrical-logo.png'));
  const meta = await sharp(source).metadata();
  const width = meta.width || 512;
  const height = meta.height || 512;
  // Same plug crop as HQ icon — mark only, not the wordmark.
  const cropWidth = Math.min(width, Math.max(1, Math.round(width * 0.255)));
  const cropHeight = Math.min(height, Math.max(1, Math.round(height * 0.78)));
  const cropped = await sharp(source)
    .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
    .flatten({ background: '#ffffff' })
    .trim({ background: '#ffffff', threshold: 16 })
    .png()
    .toBuffer();
  const plug = await whitePlugOnTransparent(cropped);
  // Match HQ mark inset (456/512); composite onto exact canvas to avoid pad rounding overflow.
  const inner = Math.max(1, Math.round(size * (456 / 512)));
  const sized = await sharp(plug)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const png = await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: FIELD_BG,
    },
  })
    .composite([{ input: sized, gravity: 'centre' }])
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public,max-age=3600' },
  });
}

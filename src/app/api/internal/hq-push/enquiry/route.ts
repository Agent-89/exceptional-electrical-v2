import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  bestEffortNotifyNewEnquiry,
  pushInternalSecretMatches,
} from '@/lib/hq-push';

export const runtime = 'nodejs';

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  suburb: z.string().trim().max(120).optional().nullable(),
  service: z.string().trim().max(80).optional().nullable(),
  preview: z.string().trim().max(160).optional().nullable(),
  source: z.string().trim().max(40).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const provided =
    req.headers.get('x-hq-push-secret') ||
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    null;
  if (!pushInternalSecretMatches(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  await bestEffortNotifyNewEnquiry(parsed.data);
  return NextResponse.json({ ok: true });
}

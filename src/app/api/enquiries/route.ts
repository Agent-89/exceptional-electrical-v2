import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { dbAdmin } from '@/lib/hq-auth';
import {
  ENQUIRY_COOLDOWN_MESSAGE,
  enquiryCooldownCutoffIso,
  normalizeEnquiryEmail,
  normalizeEnquiryPhone,
} from '@/lib/enquiry-abuse';
import { bestEffortNotifyNewEnquiry } from '@/lib/hq-push';

export const runtime = 'nodejs';

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(30),
  email: z.email().max(254),
  suburb: z.string().trim().max(120).optional().default(''),
  contact_preference: z.enum(['either', 'phone', 'email']).default('either'),
  message: z.string().trim().min(10).max(3000),
  website: z.string().optional().default(''),
});

function enquiryMessagePreview(message: string, maxLen = 90): string {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, maxLen - 1).trimEnd()}…`;
}

async function hasRecentDuplicateEnquiry(
  db: ReturnType<typeof dbAdmin>,
  email: string,
  phone: string,
): Promise<boolean> {
  const cutoff = enquiryCooldownCutoffIso();
  const emailNorm = normalizeEnquiryEmail(email);
  const phoneNorm = normalizeEnquiryPhone(phone);

  const { data: byEmail, error: emailError } = await db
    .from('enquiries')
    .select('id')
    .eq('email', emailNorm)
    .gte('created_at', cutoff)
    .limit(1);
  if (emailError) {
    console.error('Enquiry cooldown email check failed', emailError.code);
    throw emailError;
  }
  if (byEmail && byEmail.length > 0) return true;

  if (phoneNorm.length < 8) return false;

  const { data: recentPhones, error: phoneError } = await db
    .from('enquiries')
    .select('phone')
    .gte('created_at', cutoff)
    .not('phone', 'is', null)
    .limit(300);
  if (phoneError) {
    console.error('Enquiry cooldown phone check failed', phoneError.code);
    throw phoneError;
  }
  return (recentPhones || []).some(
    (row) => normalizeEnquiryPhone(String(row.phone || '')) === phoneNorm,
  );
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get('content-length') || 0);
  if (length > 12000) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return NextResponse.json({ error: 'Please check the form and try again.' }, { status: 400 });
  }

  // Honeypot: pretend success without writing.
  if (result.data.website) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  let db: ReturnType<typeof dbAdmin>;
  try {
    db = dbAdmin();
  } catch {
    console.error('Enquiry storage not configured');
    return NextResponse.json(
      { error: 'Enquiries are temporarily unavailable.' },
      { status: 503 },
    );
  }

  try {
    const duplicate = await hasRecentDuplicateEnquiry(
      db,
      result.data.email,
      result.data.phone,
    );
    if (duplicate) {
      return NextResponse.json({ error: ENQUIRY_COOLDOWN_MESSAGE }, { status: 429 });
    }
  } catch {
    return NextResponse.json(
      { error: 'Unable to submit your enquiry right now.' },
      { status: 500 },
    );
  }

  const { data: enquiry, error } = await db
    .from('enquiries')
    .insert({
      name: result.data.name,
      phone: result.data.phone,
      email: normalizeEnquiryEmail(result.data.email),
      suburb: result.data.suburb || null,
      contact_preference: result.data.contact_preference,
      service: 'other',
      message: result.data.message,
      source: 'website',
      status: 'new',
    })
    .select('id')
    .single();

  if (error || !enquiry) {
    console.error('Enquiry insert failed', error?.code);
    return NextResponse.json(
      { error: 'Unable to submit your enquiry right now.' },
      { status: 500 },
    );
  }

  // Await so serverless freeze cannot drop the Apple/FCM push mid-send.
  await bestEffortNotifyNewEnquiry({
    id: enquiry.id,
    name: result.data.name,
    suburb: result.data.suburb || null,
    preview: enquiryMessagePreview(result.data.message),
    source: 'website',
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

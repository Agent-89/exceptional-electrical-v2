import { createClient } from 'npm:@supabase/supabase-js@2.81.1';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const clean = (v: unknown, max = 300) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const phone = (v: unknown) => clean(v, 40).replace(/[^0-9+]/g, '');
const normal = (v: unknown) => phone(v).replace(/^\+?61(?=\d{9}$)/, '0');
const validEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function bestEffortHqPush(payload: {
  id: string;
  name: string;
  suburb: string | null;
  service: string;
  source: string;
}) {
  try {
    const origin = (Deno.env.get('HQ_ORIGIN') || Deno.env.get('NEXT_PUBLIC_HQ_ORIGIN') || '')
      .trim()
      .replace(/\/$/, '');
    const secret = (Deno.env.get('HQ_PUSH_INTERNAL_SECRET') || '').trim();
    if (!origin || secret.length < 24) return;
    await fetch(`${origin}/api/internal/hq-push/enquiry`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hq-push-secret': secret,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('hq_push_callback_failed', error);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('VAPI_WEBHOOK_SECRET');
  if (!secret || secret.length < 24) return json({ error: 'Integration not configured' }, 503);
  const provided = req.headers.get('x-vapi-webhook-secret') ?? '';
  const encoder = new TextEncoder();
  const expected = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  const received = await crypto.subtle.digest('SHA-256', encoder.encode(provided));
  const a = new Uint8Array(expected);
  const b = new Uint8Array(received);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) return json({ error: 'Unauthorized' }, 401);
  if (Number(req.headers.get('content-length') || 0) > 250000) {
    return json({ error: 'Payload too large' }, 413);
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const msg = body?.message ?? body;
  console.info(
    'vapi_payload_shape',
    JSON.stringify({
      type: msg?.type,
      rootKeys: Object.keys(body ?? {}).slice(0, 30),
      messageKeys: Object.keys(msg ?? {}).slice(0, 40),
      analysisKeys: Object.keys(msg?.analysis ?? {}).slice(0, 30),
      callAnalysisKeys: Object.keys(msg?.call?.analysis ?? {}).slice(0, 30),
      artifactKeys: Object.keys(msg?.artifact ?? {}).slice(0, 30),
    }),
  );
  if (msg?.type !== 'end-of-call-report') return json({ ok: true, ignored: true });
  const call = msg.call ?? body.call ?? {};
  const callId = clean(call.id ?? msg.callId, 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(callId)) return json({ error: 'Missing call ID' }, 422);
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: existing } = await db
    .from('vapi_call_intake')
    .select('id,enquiry_id,outcome')
    .eq('vapi_call_id', callId)
    .maybeSingle();
  if (existing?.enquiry_id) {
    return json({ ok: true, duplicate: true, enquiry_id: existing.enquiry_id });
  }
  const outputs =
    msg.analysis?.structuredData ??
    msg.analysis?.structuredOutputs ??
    msg.structuredOutputs ??
    msg.artifact?.structuredOutputs ??
    call.analysis?.structuredOutputs ??
    msg.call?.analysis?.structuredData ??
    {};
  let extracted: any = outputs;
  if (outputs && typeof outputs === 'object' && !('customer_name' in outputs)) {
    const first = Object.values(outputs as Record<string, any>)[0] as any;
    extracted = first?.result ?? first ?? {};
  }
  if (!extracted || typeof extracted !== 'object') extracted = {};
  console.info(
    'vapi_extraction_shape',
    JSON.stringify({
      outputKeys: Object.keys(outputs ?? {}).slice(0, 20),
      extractedKeys: Object.keys(extracted ?? {}).slice(0, 30),
    }),
  );
  const missingExtraction =
    !clean(extracted.customer_name) &&
    !clean(extracted.phone_number) &&
    !clean(extracted.service_description);
  const name = clean(extracted.customer_name, 120) || 'Unknown caller';
  const number = phone(extracted.phone_number) || phone(call.customer?.number) || 'Not provided';
  const email = clean(extracted.email, 254).toLowerCase();
  const suburb = clean(extracted.suburb, 120);
  const description =
    clean(extracted.service_description, 2200) ||
    clean(msg.summary, 2200) ||
    'Phone call received — staff review required';
  const urgency = clean(extracted.urgency, 30).toLowerCase();
  const preferred = clean(extracted.preferred_date, 20);
  const alternative = clean(extracted.alternative_date, 20);
  const service = /light|downlight/i.test(description)
    ? 'lighting'
    : /commercial/i.test(description)
      ? 'commercial'
      : /repair|maintenance|fault|power point/i.test(description)
        ? 'maintenance'
        : 'other';
  const descriptionAll = [description, clean(extracted.notes, 1000)].join(' ');
  const hasConcern =
    /dissatisf|complain|concern|poor work|damage|cleanup|clean.up|unhappy|issue with (previous|recent) work/i.test(
      descriptionAll,
    );
  const isQuote =
    /quot(e|ation)|estimate|pricing|price for|cost to|request for (an? )?(ev|av|electric vehicle)? ?charger installation/i.test(
      descriptionAll,
    );
  const existingJob =
    /previous job|recent job|existing job|already (completed|installed)|follow.up on (a|the) job/i.test(
      descriptionAll,
    );
  const typeRaw = clean(extracted.enquiry_type, 40).toLowerCase().replace(/[ -]/g, '_');
  const allowedTypes = ['new_job', 'existing_job', 'complaint', 'general'];
  const enquiryType =
    isQuote || /\binstall(?:ation|ing)?\b/i.test(descriptionAll)
      ? 'new_job'
      : allowedTypes.includes(typeRaw)
        ? typeRaw
        : hasConcern
          ? 'complaint'
          : existingJob
            ? 'existing_job'
            : /repair|replace|upgrade|service|fault/i.test(descriptionAll)
              ? 'new_job'
              : 'general';
  const categoryRaw = clean(extracted.service_category, 50).toLowerCase().replace(/[ -]/g, '_');
  const categories = [
    'ev_charger',
    'lighting',
    'power_points',
    'switchboard',
    'fault_finding',
    'maintenance',
    'safety_inspection',
    'solar_battery',
    'commercial',
    'other',
  ];
  const category = /ev charg|av charg|electric vehicle|car charg/i.test(descriptionAll)
    ? 'ev_charger'
    : categories.includes(categoryRaw) && categoryRaw !== 'other'
      ? categoryRaw
      : /light|downlight/i.test(descriptionAll)
        ? 'lighting'
        : /power point|powerpoint|socket/i.test(descriptionAll)
          ? 'power_points'
          : /switchboard|meter box/i.test(descriptionAll)
            ? 'switchboard'
            : /fault|tripping|outage/i.test(descriptionAll)
              ? 'fault_finding'
              : /solar|battery/i.test(descriptionAll)
                ? 'solar_battery'
                : /safety inspect|compliance check/i.test(descriptionAll)
                  ? 'safety_inspection'
                  : /commercial/i.test(descriptionAll)
                    ? 'commercial'
                    : /maintenan|repair/i.test(descriptionAll)
                      ? 'maintenance'
                      : 'other';
  const tags = new Set<string>();
  if (isQuote) tags.add('quote_request');
  if (hasConcern) {
    tags.add('customer_concern');
    if (/complain|dissatisf|unhappy|poor work|damage/i.test(descriptionAll)) tags.add('complaint');
  }
  if (existingJob) tags.add('existing_job');
  if (/follow.up|call back|callback|speak with|contact me/i.test(descriptionAll)) {
    tags.add('follow_up');
  }
  if (preferred || /book|schedul|appointment/i.test(descriptionAll)) tags.add('scheduling');
  const allowedTags = new Set([
    'quote_request',
    'customer_concern',
    'complaint',
    'existing_job',
    'follow_up',
    'scheduling',
    'other',
  ]);
  if (Array.isArray(extracted.issue_tags)) {
    for (const t of extracted.issue_tags) {
      const v = clean(t, 40).toLowerCase().replace(/[ -]/g, '_');
      if (allowedTags.has(v)) tags.add(v);
    }
  }
  if (tags.size === 0) tags.add('other');
  const urgencyValue = ['low', 'normal', 'high', 'emergency', 'unknown'].includes(urgency)
    ? urgency
    : 'unknown';
  const dateValid = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  };
  const requestedDate = dateValid(preferred) ? preferred : null;
  const preferredTime = clean(extracted.preferred_time_window, 120) || null;
  const explicitFollowUp =
    typeof extracted.follow_up_required === 'boolean' ? extracted.follow_up_required : null;
  const followUp =
    explicitFollowUp ?? (hasConcern || tags.has('follow_up') || urgencyValue === 'emergency');
  const contactRaw = clean(extracted.contact_preference, 50).toLowerCase();
  const contactPreference = /phone|call/.test(contactRaw)
    ? 'phone'
    : /email/.test(contactRaw)
      ? 'email'
      : contactRaw === 'either'
        ? 'either'
        : null;
  const needsReview =
    missingExtraction ||
    extracted.transcription_needs_review === true ||
    (!!preferred && !requestedDate) ||
    (contactRaw !== '' && !contactPreference) ||
    number === 'Not provided' ||
    name === 'Unknown caller';
  const bookingStatus = requestedDate ? 'pending_confirmation' : null;
  const extra = [
    'Call ID: ' + callId,
    'Urgency: ' + (urgency || 'unclassified'),
    preferred ? 'Unverified preferred date (staff review): ' + preferred : '',
    alternative ? 'Unverified alternative date (staff review): ' + alternative : '',
    clean(extracted.preferred_time_window, 80)
      ? 'Time preference: ' + clean(extracted.preferred_time_window, 80)
      : '',
    clean(extracted.job_address, 200) ? 'Address: ' + clean(extracted.job_address, 200) : '',
    clean(extracted.notes, 1000),
  ]
    .filter(Boolean)
    .join('\n');
  const { data: reserved, error: reserveError } = await db
    .from('vapi_call_intake')
    .insert({
      vapi_call_id: callId,
      outcome: 'processing',
      payload: {
        received_at: new Date().toISOString(),
        urgency,
        preferred_date: preferred,
        alternative_date: alternative,
        needs_review: missingExtraction || extracted.transcription_needs_review === true,
      },
    })
    .select('id')
    .single();
  if (reserveError) {
    if (reserveError.code === '23505') return json({ ok: true, duplicate: true });
    console.error('reserve', reserveError.code);
    return json({ error: 'Storage unavailable' }, 500);
  }
  const matches = await db.from('customers').select('id,phone,email').limit(1000);
  let customerId: string | null = null;
  if (!matches.error) {
    const matched = (matches.data ?? []).filter(
      (c: any) =>
        (normal(number).length >= 9 && normal(c.phone) === normal(number)) ||
        (validEmail(email) && clean(c.email).toLowerCase() === email),
    );
    if (matched.length === 1) customerId = matched[0].id;
  }
  const { data: enquiry, error: enquiryError } = await db
    .from('enquiries')
    .insert({
      name,
      phone: number,
      email: validEmail(email) ? email : '',
      suburb: suburb || null,
      service,
      message: description + '\n\n' + extra,
      source: 'vapi',
      status: 'new',
      customer_id: customerId,
      contact_preference: contactPreference ?? 'either',
      enquiry_type: enquiryType,
      service_category: category,
      issue_tags: [...tags],
      urgency: urgencyValue,
      requested_date: requestedDate,
      preferred_time_window: preferredTime,
      follow_up_required: followUp,
      booking_status: bookingStatus,
      intake_needs_review: needsReview,
    })
    .select('id')
    .single();
  if (enquiryError || !enquiry) {
    console.error('enquiry', enquiryError?.code);
    await db.from('vapi_call_intake').update({ outcome: 'failed' }).eq('id', reserved.id);
    return json({ error: 'Could not create enquiry' }, 500);
  }
  const { error: receivedAuditError } = await db.from('enquiry_activity').insert({
    enquiry_id: enquiry.id,
    actor_id: null,
    action: 'enquiry_received',
    note: 'Received via AI receptionist',
  });
  if (receivedAuditError) console.error('received_audit', receivedAuditError.code);
  await db
    .from('vapi_call_intake')
    .update({
      enquiry_id: enquiry.id,
      customer_id: customerId,
      outcome: needsReview
        ? 'needs_review'
        : urgencyValue === 'emergency'
          ? 'urgent_review'
          : 'created',
    })
    .eq('id', reserved.id);

  // Await so the isolate is not frozen before the HQ notify callback finishes.
  await bestEffortHqPush({
    id: enquiry.id,
    name,
    suburb: suburb || null,
    service,
    source: 'vapi',
  });

  return json({ ok: true, enquiry_id: enquiry.id, linked_customer: !!customerId });
});

'use server';

import { z } from 'zod';
import { assertOfficeOps, dbAdmin, requireHqUser } from '@/lib/hq-auth';

const subscriptionSchema = z.object({
  endpoint: z.string().url().min(20).max(2048),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(512),
  }),
  userAgent: z.string().max(400).optional(),
});

export type PushActionResult = { ok: true } | { ok: false; error: string };

export async function saveHqPushSubscription(
  input: unknown,
): Promise<PushActionResult> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid subscription.' };

  const db = dbAdmin();
  const now = new Date().toISOString();
  const { error } = await db.from('hq_push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: parsed.data.userAgent || null,
      updated_at: now,
    },
    { onConflict: 'endpoint' },
  );

  if (error) {
    console.error('hq_push save failed', error.code);
    return { ok: false, error: 'Could not save notification preference.' };
  }
  return { ok: true };
}

export async function deleteHqPushSubscription(
  endpoint: string,
): Promise<PushActionResult> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  if (typeof endpoint !== 'string' || endpoint.length < 20 || endpoint.length > 2048) {
    return { ok: false, error: 'Invalid subscription.' };
  }

  const db = dbAdmin();
  const { error } = await db
    .from('hq_push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint);

  if (error) {
    console.error('hq_push delete failed', error.code);
    return { ok: false, error: 'Could not update notification preference.' };
  }
  return { ok: true };
}

export async function getHqPushSubscriptionStatus(): Promise<{
  enabled: boolean;
  configured: boolean;
  subscribed: boolean;
}> {
  const user = await requireHqUser();
  assertOfficeOps(user);

  const configured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
  const enabled = process.env.HQ_PUSH_ENABLED === '1' && configured;

  const { count } = await dbAdmin()
    .from('hq_push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  return { enabled, configured, subscribed: (count ?? 0) > 0 };
}

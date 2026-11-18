import 'server-only';
import webpush from 'web-push';
import { dbAdmin } from '@/lib/hq-auth';
import { OFFICE_ROLES } from '@/lib/hq-roles';
export { pushInternalSecretMatches } from '@/lib/hq-push-secret';

export type EnquiryPushSource = 'website' | 'vapi' | string;

export type EnquiryPushPayload = {
  id: string;
  name: string;
  suburb?: string | null;
  service?: string | null;
  source?: EnquiryPushSource | null;
};

type StoredSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function pushEnabled(): boolean {
  return process.env.HQ_PUSH_ENABLED === '1';
}

function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

function configureVapid(): boolean {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!.trim(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  return true;
}

function sourceLabel(source: EnquiryPushSource | null | undefined): string {
  if (source === 'vapi') return 'Phone';
  if (source === 'website') return 'Website';
  return source ? String(source) : 'Enquiry';
}

function buildNotification(payload: EnquiryPushPayload) {
  const suburb = String(payload.suburb || '').trim();
  const service = String(payload.service || '').trim().replaceAll('_', ' ');
  const detail = [suburb, service].filter(Boolean).join(' · ');
  const title = `New enquiry · ${sourceLabel(payload.source)}`;
  const body = detail
    ? `${payload.name} — ${detail}`
    : `${payload.name} submitted an enquiry`;
  return {
    title,
    body,
    url: `/hq/enquiries/${payload.id}`,
    tag: `enquiry-${payload.id}`,
  };
}

async function loadOfficeSubscriptions(): Promise<StoredSubscription[]> {
  const db = dbAdmin();
  const { data: staff, error: staffError } = await db
    .from('staff_profiles')
    .select('user_id')
    .eq('active', true)
    .in('role', [...OFFICE_ROLES]);
  if (staffError) {
    console.error('hq_push staff lookup failed', staffError.code);
    return [];
  }
  const userIds = (staff || []).map((row) => row.user_id as string);
  if (userIds.length === 0) return [];

  const { data: subs, error: subError } = await db
    .from('hq_push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .in('user_id', userIds);
  if (subError) {
    console.error('hq_push subscription lookup failed', subError.code);
    return [];
  }
  return (subs || []) as StoredSubscription[];
}

async function deleteSubscription(id: string) {
  try {
    await dbAdmin().from('hq_push_subscriptions').delete().eq('id', id);
  } catch (error) {
    console.error('hq_push stale delete failed', error);
  }
}

function pushErrorMeta(error: unknown): { statusCode: number; body: string } {
  if (!error || typeof error !== 'object') return { statusCode: 0, body: '' };
  const statusCode =
    'statusCode' in error ? Number((error as { statusCode?: number }).statusCode) || 0 : 0;
  const body =
    'body' in error && typeof (error as { body?: unknown }).body === 'string'
      ? String((error as { body: string }).body).slice(0, 240)
      : '';
  return { statusCode, body };
}

async function sendToSubscriptions(
  subscriptions: StoredSubscription[],
  notification: ReturnType<typeof buildNotification>,
): Promise<{ sent: number; failed: number; pruned: number }> {
  let sent = 0;
  let failed = 0;
  let pruned = 0;
  const payload = JSON.stringify(notification);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          {
            TTL: 60 * 60,
            urgency: 'high',
          },
        );
        sent += 1;
      } catch (error) {
        const { statusCode, body } = pushErrorMeta(error);
        if (statusCode === 404 || statusCode === 410) {
          await deleteSubscription(sub.id);
          pruned += 1;
          console.info('hq_push pruned stale endpoint', statusCode);
          return;
        }
        failed += 1;
        console.error('hq_push send failed', statusCode || 'unknown', body || '');
      }
    }),
  );

  return { sent, failed, pruned };
}

/**
 * Best-effort fan-out to opted-in office HQ PWA subscriptions.
 * Never throws to callers — intake must succeed even if push fails.
 */
export async function bestEffortNotifyNewEnquiry(payload: EnquiryPushPayload): Promise<void> {
  try {
    if (!pushEnabled()) {
      console.info('hq_push skipped: HQ_PUSH_ENABLED is not 1');
      return;
    }
    if (!configureVapid()) {
      console.info('hq_push skipped: VAPID env incomplete');
      return;
    }
    if (!/^[0-9a-f-]{36}$/i.test(payload.id)) return;

    const notification = buildNotification(payload);
    const subscriptions = await loadOfficeSubscriptions();
    if (subscriptions.length === 0) {
      console.info('hq_push skipped: no office subscriptions');
      return;
    }

    const result = await sendToSubscriptions(subscriptions, notification);
    console.info(
      'hq_push enquiry fan-out',
      `subs=${subscriptions.length}`,
      `sent=${result.sent}`,
      `failed=${result.failed}`,
      `pruned=${result.pruned}`,
    );
  } catch (error) {
    console.error('hq_push notify failed', error);
  }
}

/**
 * Send a one-off test alert to a single office user's stored endpoints.
 */
export async function sendHqPushTestToUser(userId: string): Promise<{
  ok: boolean;
  error?: string;
  sent?: number;
  failed?: number;
}> {
  try {
    if (!pushEnabled()) {
      return { ok: false, error: 'Push alerts are not enabled on this environment yet.' };
    }
    if (!configureVapid()) {
      return { ok: false, error: 'Push alerts are not configured on this environment yet.' };
    }

    const { data: subs, error } = await dbAdmin()
      .from('hq_push_subscriptions')
      .select('id,endpoint,p256dh,auth')
      .eq('user_id', userId);
    if (error) {
      console.error('hq_push test lookup failed', error.code);
      return { ok: false, error: 'Could not load notification subscriptions.' };
    }
    const subscriptions = (subs || []) as StoredSubscription[];
    if (subscriptions.length === 0) {
      return {
        ok: false,
        error: 'No push subscription is saved for this account. Enable alerts on this device first.',
      };
    }

    const notification = {
      title: 'HQ test alert',
      body: 'If you see this, enquiry push is working on this device.',
      url: '/hq/enquiries',
      tag: `hq-push-test-${Date.now()}`,
    };
    const result = await sendToSubscriptions(subscriptions, notification);
    console.info(
      'hq_push test fan-out',
      `user=${userId}`,
      `sent=${result.sent}`,
      `failed=${result.failed}`,
      `pruned=${result.pruned}`,
    );
    if (result.sent === 0) {
      return {
        ok: false,
        error:
          result.pruned > 0
            ? 'Saved subscription was stale. Enable alerts on this device again.'
            : 'Push provider rejected the test alert. Try re-enabling on this device.',
        sent: 0,
        failed: result.failed,
      };
    }
    return { ok: true, sent: result.sent, failed: result.failed };
  } catch (error) {
    console.error('hq_push test failed', error);
    return { ok: false, error: 'Could not send a test alert.' };
  }
}


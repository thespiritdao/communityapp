/**
 * Server-side notification helper.
 *
 * Provides the same guarantees as POST /api/notifications/send
 * (preference check → DB insert → push delivery) but callable
 * directly from any API route without an HTTP round-trip.
 */

import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

// ── Types ────────���───────────────────────────────────────────────────────────

export interface ServerNotificationPayload {
  recipient_address: string;
  sender_address: string;
  notification_type: string;
  title: string;
  message: string;
  context_url?: string;
  context_type?: string;
  context_id?: string;
  proposal_id?: string;
  transaction_hash?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
}

export interface ServerNotificationResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  notification?: any;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a notification with full preference checking and push delivery.
 * Safe to call from any server-side context (API routes, cron jobs, etc.).
 */
export async function sendServerNotification(
  data: ServerNotificationPayload,
): Promise<ServerNotificationResult> {
  const {
    recipient_address,
    sender_address,
    notification_type,
    title,
    message,
    context_url,
    context_type,
    context_id,
    proposal_id,
    transaction_hash,
    priority = 'medium',
  } = data;

  const category = data.category || determineCategory(notification_type);

  // Check user preferences
  const shouldSend = await checkUserPreferences(
    recipient_address,
    notification_type,
    category,
    priority,
  );

  if (!shouldSend) {
    return { success: true, skipped: true, reason: 'User preferences' };
  }

  // Insert into the appropriate table
  let notification: any;

  if (category === 'governance') {
    const { data: row, error } = await supabaseAdmin
      .from('governance_notifications')
      .insert([{
        recipient_address: recipient_address.toLowerCase(),
        sender_address: sender_address.toLowerCase(),
        notification_type,
        title,
        message,
        context_url,
        context_type,
        context_id,
        proposal_id,
        transaction_hash,
      }])
      .select()
      .single();

    if (error) throw error;
    notification = row;
  } else {
    const { data: row, error } = await supabaseAdmin
      .from('general_notifications')
      .insert([{
        recipient_address: recipient_address.toLowerCase(),
        sender_address: sender_address.toLowerCase(),
        notification_type,
        title,
        message,
        context_url,
        context_type,
        context_id,
      }])
      .select()
      .single();

    if (error) throw error;
    notification = row;
  }

  // Fire push (non-blocking)
  sendPushNotifications(recipient_address, title, message, context_url).catch(
    (err) => console.warn('[push] Background push failed:', err),
  );

  return { success: true, notification };
}

/**
 * Batch-send notifications to multiple recipients.
 * Each recipient gets an independent preference check and push delivery.
 */
export async function sendServerNotificationBatch(
  payloads: ServerNotificationPayload[],
): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;

  await Promise.allSettled(
    payloads.map(async (p) => {
      try {
        const result = await sendServerNotification(p);
        if (result.skipped) skipped++;
        else sent++;
      } catch (err) {
        console.error(`[serverNotifications] Failed for ${p.recipient_address}:`, err);
      }
    }),
  );

  return { sent, skipped };
}

// ── Internal helpers (mirrored from /api/notifications/send) ─────────────────

function determineCategory(notificationType: string): string {
  if (
    notificationType.startsWith('governance_') ||
    notificationType === 'proposal_created' ||
    notificationType === 'proposal_mentioned' ||
    notificationType === 'proposal_voted' ||
    notificationType === 'proposal_executed' ||
    notificationType === 'proposal_cancelled' ||
    notificationType === 'token_holder_notification' ||
    notificationType === 'pod_approval_request' ||
    notificationType === 'pod_approved' ||
    notificationType === 'pod_rejected'
  ) return 'governance';
  if (notificationType.startsWith('pod_')) return 'pod';
  if (notificationType.startsWith('bounty_')) return 'bounty';
  if (notificationType.startsWith('chat_')) return 'chat';
  if (notificationType.startsWith('forum_')) return 'forum';
  if (notificationType.startsWith('event_')) return 'event';
  if (notificationType.startsWith('marketplace_')) return 'marketplace';
  return 'general';
}

async function checkUserPreferences(
  userAddress: string,
  notificationType: string,
  category: string,
  priority: string,
): Promise<boolean> {
  try {
    const { data: preferences, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .single();

    if (error && error.code === 'PGRST116') {
      await createDefaultPreferences(userAddress);
      return true;
    }
    if (error) throw error;
    if (!preferences) return true;

    if (!preferences.enabled) return false;

    const categoryKey = `category_${category}` as keyof typeof preferences;
    if (preferences[categoryKey] === false) return false;

    const typeKey = notificationType as keyof typeof preferences;
    if (typeKey in preferences && preferences[typeKey] === false) return false;

    if (preferences.quiet_hours_enabled) {
      const currentTime = new Date().toTimeString().slice(0, 8);
      const start = preferences.quiet_hours_start || '22:00:00';
      const end = preferences.quiet_hours_end || '08:00:00';

      if (isInQuietHours(currentTime, start, end)) {
        if (priority === 'low' || priority === 'medium') return false;
      }
    }

    return true;
  } catch {
    return true; // fail open
  }
}

async function createDefaultPreferences(userAddress: string) {
  try {
    await supabaseAdmin.from('notification_preferences').insert({
      user_address: userAddress.toLowerCase(),
      enabled: true,
      desktop_enabled: true,
      sound_enabled: true,
      quiet_hours_enabled: false,
      quiet_hours_start: '22:00:00',
      quiet_hours_end: '08:00:00',
      category_pod: true,
      category_governance: true,
      category_bounty: true,
      category_chat: true,
      category_forum: true,
      category_event: true,
      category_marketplace: true,
    });
  } catch {
    // best-effort
  }
}

function isInQuietHours(current: string, start: string, end: string): boolean {
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

async function sendPushNotifications(
  recipientAddress: string,
  title: string,
  message: string,
  contextUrl?: string,
) {
  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_address', recipientAddress.toLowerCase());

  if (error || !subscriptions?.length) return;

  const payload = JSON.stringify({
    title,
    body: message,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: { url: contextUrl || '/notifications' },
  });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }),
  );
}

/**
 * API Route: Send Notification (Server-Side)
 *
 * Handles creating notifications using admin client to bypass RLS.
 * This is necessary because notifications are system-level operations
 * where one user (sender) creates notifications FOR other users (recipients).
 *
 * Authentication:
 * - Client calls: JWT Bearer token (sender_address verified against token)
 * - Server-to-server calls: Internal API key via X-Internal-Key header
 *   (used by cron jobs, webhooks, and other API routes)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import webpush from 'web-push';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';
import { safeAppPath } from '@/lib/safeAppPath';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

async function getWalletFromToken(token: string): Promise<string | null> {
  try {
    // verifySessionTokenOrThrow checks Supabase-issued (ES256/JWKS) tokens
    // itself; it must not depend on the legacy shared secret existing.
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate: accept either JWT Bearer token or internal API key
    const authToken = request.headers.get('Authorization')?.replace('Bearer ', '');
    const internalKey = request.headers.get('X-Internal-Key');
    const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    let callerAddress: string | null = null;
    let isInternalCall = false;

    if (internalKey && internalKey === INTERNAL_API_KEY) {
      // Server-to-server call (cron jobs, webhooks, other API routes)
      isInternalCall = true;
    } else if (authToken) {
      // Client call — verify JWT
      callerAddress = await getWalletFromToken(authToken);
      if (!callerAddress) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await request.json();

    console.log('📨 [/api/notifications/send] Received request:', {
      notification_type: data.notification_type,
      recipient: data.recipient_address,
      sender: data.sender_address,
      title: data.title,
      isInternalCall,
    });

    let {
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
      category,
    } = data;

    // Validate required fields
    if (
      !recipient_address ||
      !sender_address ||
      !notification_type ||
      !title ||
      !message
    ) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 },
      );
    }

    // Links must stay on the app (digest emails and push taps open them).
    context_url = safeAppPath(context_url);

    // For client calls, verify sender_address matches the authenticated caller.
    // 'system' is for server-side senders; from a browser it is attributed to
    // the member who sent it, so nobody can send official-looking notices.
    if (!isInternalCall && callerAddress && sender_address === 'system') {
      sender_address = callerAddress.toLowerCase();
    }
    if (!isInternalCall && callerAddress) {
      if (sender_address.toLowerCase() !== callerAddress.toLowerCase()) {
        return NextResponse.json(
          { error: 'Forbidden: caller does not match sender_address' },
          { status: 403 },
        );
      }
    }

    // Determine category if not provided
    const notificationCategory =
      category || determineCategory(notification_type);

    // Check user preferences (using admin client)
    const shouldSend = await checkUserPreferences(
      recipient_address,
      notification_type,
      notificationCategory,
      priority,
    );

    if (!shouldSend) {
      console.log(
        `[API] Notification skipped (user preferences): ${notification_type} for ${recipient_address}`,
      );
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'User preferences',
      });
    }

    // Create notification using admin client
    let notification;
    if (notificationCategory === 'governance') {
      console.log('📋 [/api/notifications/send] Creating governance notification');
      const { data: govNotification, error } = await supabaseAdmin
        .from('governance_notifications')
        .insert([
          {
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
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('❌ [/api/notifications/send] Governance insert error:', error);
        throw error;
      }
      notification = govNotification;
      console.log('✅ [/api/notifications/send] Governance notification created:', govNotification.id);
    } else {
      console.log('📋 [/api/notifications/send] Creating general notification to table:', 'general_notifications');
      console.log('📋 [/api/notifications/send] Insert data:', {
        recipient_address: recipient_address.toLowerCase(),
        sender_address: sender_address.toLowerCase(),
        notification_type,
        title,
        message,
        context_url,
        context_type,
        context_id,
      });

      const { data: generalNotification, error } = await supabaseAdmin
        .from('general_notifications')
        .insert([
          {
            recipient_address: recipient_address.toLowerCase(),
            sender_address: sender_address.toLowerCase(),
            notification_type,
            title,
            message,
            context_url,
            context_type,
            context_id,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error('❌ [/api/notifications/send] General insert error:', error);
        console.error('❌ [/api/notifications/send] Error details:', JSON.stringify(error, null, 2));
        throw error;
      }
      notification = generalNotification;
      console.log('✅ [/api/notifications/send] General notification created:', generalNotification?.id);
    }

    console.log(`✅ [/api/notifications/send] Notification sent successfully to ${recipient_address}`);

    // Fire push notifications to all subscribed devices for this user (non-blocking)
    sendPushNotifications(recipient_address, title, message, context_url).catch((err) =>
      console.warn('[push] Background push failed:', err),
    );

    return NextResponse.json({
      success: true,
      notification,
    });
  } catch (error: any) {
    // Per-sender limits enforced by the notification_rate_limit trigger
    // (migration 20260929000001).
    if (error?.code === 'P0429') {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error('[API] Failed to send notification:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notification' },
      { status: 500 },
    );
  }
}

/**
 * Determine notification category from type
 */
function determineCategory(notificationType: string): string {
  // Check governance-specific notifications FIRST (including pod-governance types)
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
  )
    return 'governance';
  // Then check other pod-related notifications
  if (notificationType.startsWith('pod_')) return 'pod';
  if (notificationType.startsWith('bounty_')) return 'bounty';
  if (notificationType.startsWith('chat_')) return 'chat';
  if (notificationType.startsWith('forum_')) return 'forum';
  if (notificationType.startsWith('event_')) return 'event';
  if (notificationType.startsWith('marketplace_')) return 'marketplace';
  return 'general';
}

/**
 * Check if user wants to receive this notification
 */
async function checkUserPreferences(
  userAddress: string,
  notificationType: string,
  category: string,
  priority: string,
): Promise<boolean> {
  try {
    // Get user preferences
    const { data: preferences, error } = await supabaseAdmin
      .from('notification_preferences')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .single();

    // If no preferences found, create defaults and return true
    if (error && error.code === 'PGRST116') {
      await createDefaultPreferences(userAddress);
      return true; // Default is to send all notifications
    }

    if (error) throw error;
    if (!preferences) return true; // If something went wrong, allow notification

    // Check if notifications are globally disabled
    if (!preferences.enabled) {
      console.log(`[API] Notifications globally disabled for ${userAddress}`);
      return false;
    }

    // Check category preference
    const categoryKey = `category_${category}` as keyof typeof preferences;
    if (preferences[categoryKey] === false) {
      console.log(`[API] Category ${category} disabled for ${userAddress}`);
      return false;
    }

    // Check specific notification type preference
    const typeKey = notificationType as keyof typeof preferences;
    if (typeKey in preferences && preferences[typeKey] === false) {
      console.log(
        `[API] Notification type ${notificationType} disabled for ${userAddress}`,
      );
      return false;
    }

    // Check quiet hours if enabled
    if (preferences.quiet_hours_enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS
      const start = preferences.quiet_hours_start || '22:00:00';
      const end = preferences.quiet_hours_end || '08:00:00';

      if (isInQuietHours(currentTime, start, end)) {
        // Only block low/medium priority during quiet hours
        if (priority === 'low' || priority === 'medium') {
          console.log(
            `[API] Quiet hours active for ${userAddress}, blocking ${priority} priority`,
          );
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    console.error(
      '[API] Error checking preferences, allowing notification:',
      error,
    );
    return true; // Fail open - allow notification if preference check fails
  }
}

/**
 * Create default notification preferences for new user
 */
async function createDefaultPreferences(userAddress: string) {
  const defaults = {
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
  };

  try {
    await supabaseAdmin
      .from('notification_preferences')
      .insert({ user_address: userAddress.toLowerCase(), ...defaults });

    console.log(`[API] Created default preferences for ${userAddress}`);
  } catch (error) {
    console.error('[API] Error creating default preferences:', error);
  }
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(current: string, start: string, end: string): boolean {
  if (start < end) {
    return current >= start && current < end;
  } else {
    return current >= start || current < end;
  }
}

/**
 * Send Web Push notifications to all subscribed devices for a user.
 * Stale subscriptions (410 Gone) are automatically removed.
 */
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
          // Subscription expired — remove it
          await supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    }),
  );
}

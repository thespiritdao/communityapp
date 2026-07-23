/**
 * Event reminder cron job.
 *
 * Checks upcoming published events and sends reminders to registered attendees:
 *   - 7-day reminder (event_one_week_reminder)
 *   - Day-of reminder (event_day_reminder)
 *
 * Deduplication: checks event_notifications.sent_at to avoid resending.
 * Preferences: respects category_event + per-type toggles.
 *
 * Schedule: every 6 hours (see vercel.json)
 * Auth: CRON_SECRET header (Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import webpush from 'web-push';
import { requireCron } from '@/lib/cronAuth';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

const REMINDER_WINDOWS = [
  {
    type: 'event_one_week_reminder' as const,
    prefKey: 'event_reminder_7d',
    ms: 7 * 24 * 60 * 60 * 1000,
    label: '7 days',
    bufferMs: 4 * 60 * 60 * 1000, // 4h buffer for 6h cron
  },
  {
    type: 'event_day_reminder' as const,
    prefKey: 'event_reminder_day_of',
    ms: 24 * 60 * 60 * 1000,
    label: '24 hours',
    bufferMs: 4 * 60 * 60 * 1000,
  },
];

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const now = Date.now();
    let totalSent = 0;
    let totalSkipped = 0;

    // Fetch all published events happening in the next 8 days
    const eightDaysFromNow = new Date(now + 8 * 24 * 60 * 60 * 1000).toISOString();
    const { data: upcomingEvents } = await supabaseAdmin
      .from('events')
      .select('id, title, event_date, organizing_pod_id')
      .eq('status', 'published')
      .gt('event_date', new Date().toISOString())
      .lt('event_date', eightDaysFromNow);

    if (!upcomingEvents?.length) {
      return NextResponse.json({ success: true, sent: 0, skipped: 0, reason: 'No upcoming events' });
    }

    for (const event of upcomingEvents) {
      const eventTime = new Date(event.event_date).getTime();

      for (const window of REMINDER_WINDOWS) {
        const targetTime = eventTime - window.ms;
        // Only send if we're within the buffer window of when this reminder should fire
        if (now < targetTime - window.bufferMs || now > targetTime + window.bufferMs) continue;

        // Get registered attendees
        const { data: registrations } = await supabaseAdmin
          .from('event_registrations')
          .select('user_address')
          .eq('event_id', event.id)
          .in('registration_status', ['registered', 'checked_in']);

        if (!registrations?.length) continue;

        const attendeeAddresses = registrations.map((r) => r.user_address.toLowerCase());

        // Who already got this reminder?
        const { data: alreadySent } = await supabaseAdmin
          .from('event_notifications')
          .select('recipient_address')
          .eq('event_id', event.id)
          .eq('notification_type', window.type)
          .not('sent_at', 'is', null);

        const sentSet = new Set(
          (alreadySent ?? []).map((n) => n.recipient_address.toLowerCase()),
        );

        // Check preferences in batch
        const { data: prefs } = await supabaseAdmin
          .from('notification_preferences')
          .select(`user_address, enabled, category_event, ${window.prefKey}`)
          .in('user_address', attendeeAddresses);

        const prefsMap = new Map<string, any>();
        (prefs ?? []).forEach((p: any) => prefsMap.set(p.user_address.toLowerCase(), p));

        const toNotify = attendeeAddresses.filter((addr) => {
          if (sentSet.has(addr)) return false;
          const p = prefsMap.get(addr);
          if (!p) return true; // no preferences = default opt-in
          if (!p.enabled || !p.category_event) return false;
          if (p[window.prefKey] === false) return false;
          return true;
        });

        if (toNotify.length === 0) continue;

        // Insert into event_notifications table (with sent_at for dedup)
        const rows = toNotify.map((addr) => ({
          recipient_address: addr,
          event_id: event.id,
          notification_type: window.type,
          title: `Event in ${window.label}: ${event.title}`,
          message: `"${event.title}" starts in ${window.label}. Don't forget to attend!`,
          context_url: '/events',
          sent_at: new Date().toISOString(),
        }));

        const { error: insertError } = await supabaseAdmin
          .from('event_notifications')
          .insert(rows);

        if (insertError) {
          console.error(`[event-reminders] Insert error for event ${event.id}:`, insertError);
          totalSkipped += toNotify.length;
          continue;
        }

        totalSent += toNotify.length;

        // Fire push notifications (non-blocking)
        Promise.allSettled(
          toNotify.map((addr) =>
            sendPush(addr, rows[0].title, rows[0].message, '/events'),
          ),
        ).catch((err) => console.warn('[event-reminders] Push error:', err));
      }
    }

    console.log(`[event-reminders] Done: ${totalSent} sent, ${totalSkipped} skipped`);
    return NextResponse.json({ success: true, sent: totalSent, skipped: totalSkipped });
  } catch (err: any) {
    console.error('[event-reminders] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ── Push helper ─────────────────────────────────────────────────────────────

async function sendPush(recipientAddress: string, title: string, message: string, url: string) {
  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_address', recipientAddress.toLowerCase());

  if (!subscriptions?.length) return;

  const payload = JSON.stringify({
    title,
    body: message,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    data: { url },
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

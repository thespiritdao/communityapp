// src/app/api/cron/community-agent/check-subscriptions/route.ts
//
// Cron job: marks expired subscriptions and sends expiry warnings.
// Schedule: 0 0 * * * (daily midnight UTC)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireCron } from '@/lib/cronAuth';

export const runtime = 'nodejs';

/** Insert a notification into general_notifications (unified notification system). */
async function notifyLeader(
  leaderWallet: string,
  podId: string,
  podName: string,
  type: 'community_agent_expiring' | 'community_agent_expired',
  message: string,
) {
  await supabaseAdmin.from('general_notifications').insert({
    recipient_address: leaderWallet.toLowerCase(),
    sender_address: null,
    notification_type: type,
    title: type === 'community_agent_expired'
      ? 'Community Agent subscription expired'
      : 'Community Agent subscription expiring soon',
    message,
    context_url: `/pods/${podId}/manage`,
    context_type: 'pod',
    context_id: podId,
    priority: type === 'community_agent_expired' ? 'urgent' : 'high',
    is_read: false,
  });
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  let expired = 0;
  let warned = 0;

  try {
    const now = new Date().toISOString();

    // ── 1. Mark expired subscriptions ──────────────────────────────────
    const { data: expiredSubs } = await supabaseAdmin
      .from('community_agent_subscriptions')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'active')
      .lt('expires_at', now)
      .select('pod_id');

    expired = expiredSubs?.length || 0;

    // Notify leaders of pods that just expired
    if (expiredSubs) {
      for (const sub of expiredSubs) {
        const { data: pod } = await supabaseAdmin
          .from('pods')
          .select('pod_leads, name')
          .eq('id', sub.pod_id)
          .single();

        if (pod?.pod_leads) {
          for (const leaderWallet of pod.pod_leads) {
            await notifyLeader(
              leaderWallet,
              sub.pod_id,
              pod.name,
              'community_agent_expired',
              `The Community Agent for ${pod.name} has expired and is no longer active. Renew your subscription to restore it.`,
            );
          }
        }
      }
    }

    // ── 2. Warn about subscriptions expiring in 3 days ─────────────────
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: expiringSoon } = await supabaseAdmin
      .from('community_agent_subscriptions')
      .select('pod_id, expires_at')
      .eq('status', 'active')
      .lt('expires_at', threeDaysFromNow.toISOString())
      .gt('expires_at', now);

    if (expiringSoon) {
      for (const sub of expiringSoon) {
        const { data: pod } = await supabaseAdmin
          .from('pods')
          .select('pod_leads, name')
          .eq('id', sub.pod_id)
          .single();

        if (pod?.pod_leads) {
          for (const leaderWallet of pod.pod_leads) {
            await notifyLeader(
              leaderWallet,
              sub.pod_id,
              pod.name,
              'community_agent_expiring',
              `The Community Agent for ${pod.name} expires on ${new Date(sub.expires_at).toLocaleDateString()}. Renew to keep it active.`,
            );
            warned++;
          }
        }
      }
    }

    console.log(`[CheckSubscriptions] ${expired} expired, ${warned} warnings sent`);
    return NextResponse.json({ success: true, expired, warned });
  } catch (err: any) {
    console.error('[CheckSubscriptions] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

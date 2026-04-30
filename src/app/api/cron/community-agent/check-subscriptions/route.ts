// src/app/api/cron/community-agent/check-subscriptions/route.ts
//
// Cron job: marks expired subscriptions and sends expiry warnings.
// Schedule: 0 0 * * * (daily midnight UTC)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let expired = 0;
  let warned = 0;

  try {
    const now = new Date().toISOString();

    // Mark expired subscriptions
    const { data: expiredSubs } = await supabaseAdmin
      .from('community_agent_subscriptions')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'active')
      .lt('expires_at', now)
      .select('pod_id');

    expired = expiredSubs?.length || 0;

    // Find subscriptions expiring in the next 3 days (for warning notifications)
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
        // Get pod leaders to notify
        const { data: pod } = await supabaseAdmin
          .from('pods')
          .select('pod_leads, name')
          .eq('id', sub.pod_id)
          .single();

        if (pod?.pod_leads) {
          for (const leaderWallet of pod.pod_leads) {
            const { data: profile } = await supabaseAdmin
              .from('user_profiles')
              .select('user_id')
              .eq('wallet_address', leaderWallet)
              .single();

            if (profile?.user_id) {
              const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
                user_id: profile.user_id,
                type: 'community_agent_expiring',
                title: `Community Agent subscription expiring soon`,
                message: `The Community Agent for ${pod.name} expires on ${new Date(sub.expires_at).toLocaleDateString()}. Renew to keep it active.`,
                url: `/pods/${sub.pod_id}/manage`,
                created_at: now,
              });
              if (!notifErr) warned++;
            }
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

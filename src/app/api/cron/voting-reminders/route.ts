/**
 * Governance voting reminder cron job.
 *
 * Checks pod-level and DAO-wide proposals nearing their voting deadlines
 * and sends reminders to eligible members who haven't voted yet.
 *
 * Reminder windows: 48h, 24h, 6h, 1h before deadline.
 * Deduplication: checks general_notifications for existing reminders.
 *
 * Schedule: every 30 minutes (see vercel.json)
 * Auth: CRON_SECRET header (Vercel Cron)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import type { ServerNotificationPayload } from '@/lib/serverNotifications';
import { requireCron } from '@/lib/cronAuth';

const REMINDER_WINDOWS = [
  { key: '48h', ms: 48 * 60 * 60 * 1000, prefKey: 'governance_voting_reminder_48h', label: '48 hours' },
  { key: '24h', ms: 24 * 60 * 60 * 1000, prefKey: 'governance_voting_reminder_24h', label: '24 hours' },
  { key: '6h', ms: 6 * 60 * 60 * 1000, prefKey: 'governance_voting_reminder_6h', label: '6 hours' },
  { key: '1h', ms: 1 * 60 * 60 * 1000, prefKey: 'governance_voting_reminder_1h', label: '1 hour' },
] as const;

// Buffer: only send a reminder if the deadline is within [window - buffer, window + buffer]
// With a 30-min cron schedule, 20-min buffer avoids missed windows
const BUFFER_MS = 20 * 60 * 1000;

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    const now = Date.now();
    let totalSent = 0;
    let totalSkipped = 0;

    // ── 1. Pod-level proposals with active voting ──────────────────────────

    const { data: podProposals } = await supabaseAdmin
      .from('pod_level_proposals')
      .select('id, title, pod_id, voting_deadline')
      .in('status', ['proposed', 'active'])
      .not('voting_deadline', 'is', null)
      .gt('voting_deadline', new Date().toISOString());

    for (const proposal of podProposals ?? []) {
      const deadline = new Date(proposal.voting_deadline).getTime();

      for (const window of REMINDER_WINDOWS) {
        const targetTime = deadline - window.ms;
        if (Math.abs(now - targetTime) > BUFFER_MS) continue;

        // Find pod members who haven't voted
        const { data: members } = await supabaseAdmin
          .from('pod_members')
          .select('wallet')
          .eq('pod_id', proposal.pod_id)
          .eq('is_active', true);

        if (!members?.length) continue;

        const memberAddresses = members.map((m) => m.wallet.toLowerCase());

        // Who already voted?
        const { data: existingVotes } = await supabaseAdmin
          .from('governance_votes')
          .select('voter_address')
          .eq('proposal_id', proposal.id);

        const votedSet = new Set(
          (existingVotes ?? []).map((v) => v.voter_address.toLowerCase()),
        );

        // Who already got this reminder?
        const { data: existingReminders } = await supabaseAdmin
          .from('general_notifications')
          .select('recipient_address')
          .eq('notification_type', 'voting_reminder')
          .eq('context_id', proposal.id)
          .like('title', `%${window.label}%`);

        const remindedSet = new Set(
          (existingReminders ?? []).map((r) => r.recipient_address.toLowerCase()),
        );

        const toNotify = memberAddresses.filter(
          (addr) => !votedSet.has(addr) && !remindedSet.has(addr),
        );

        if (toNotify.length === 0) continue;

        const payloads: ServerNotificationPayload[] = toNotify.map((addr) => ({
          recipient_address: addr,
          sender_address: 'system',
          notification_type: 'voting_reminder',
          title: `Voting ends in ${window.label}: ${proposal.title}`,
          message: `A proposal in your pod needs your vote. Voting closes in ${window.label}.`,
          context_url: '/governance',
          context_type: 'governance',
          context_id: proposal.id,
          priority: window.ms <= 6 * 60 * 60 * 1000 ? 'urgent' as const : 'high' as const,
          category: 'governance',
        }));

        const result = await sendServerNotificationBatch(payloads);
        totalSent += result.sent;
        totalSkipped += result.skipped;
      }
    }

    // ── 2. DAO-wide proposals (on-chain Governor) ─────────────────────────

    const { data: daoProposals } = await supabaseAdmin
      .from('proposal_metadata')
      .select('id, title, onchain_proposal_id, voting_end')
      .eq('status', 'active')
      .not('voting_end', 'is', null);

    for (const proposal of daoProposals ?? []) {
      if (!proposal.voting_end) continue;
      const deadline = new Date(proposal.voting_end).getTime();
      if (deadline <= now) continue; // already past

      for (const window of REMINDER_WINDOWS) {
        const targetTime = deadline - window.ms;
        if (Math.abs(now - targetTime) > BUFFER_MS) continue;

        // For DAO-wide proposals, notify all users with governance preferences
        const { data: allUsers } = await supabaseAdmin
          .from('notification_preferences')
          .select('user_address')
          .eq('enabled', true)
          .eq('category_governance', true);

        if (!allUsers?.length) continue;

        const allAddresses = allUsers.map((u) => u.user_address.toLowerCase());

        // Who already voted on-chain?
        const { data: onchainVotes } = await supabaseAdmin
          .from('governance_user_votes')
          .select('voter_address')
          .eq('proposal_id', proposal.onchain_proposal_id);

        const votedSet = new Set(
          (onchainVotes ?? []).map((v) => v.voter_address.toLowerCase()),
        );

        // Who already got this reminder?
        const { data: existingReminders } = await supabaseAdmin
          .from('governance_notifications')
          .select('recipient_address')
          .eq('notification_type', 'voting_reminder')
          .eq('context_id', proposal.id)
          .like('title', `%${window.label}%`);

        const remindedSet = new Set(
          (existingReminders ?? []).map((r) => r.recipient_address.toLowerCase()),
        );

        const toNotify = allAddresses.filter(
          (addr) => !votedSet.has(addr) && !remindedSet.has(addr),
        );

        if (toNotify.length === 0) continue;

        const payloads: ServerNotificationPayload[] = toNotify.map((addr) => ({
          recipient_address: addr,
          sender_address: 'system',
          notification_type: 'voting_reminder',
          title: `DAO Vote ends in ${window.label}: ${proposal.title}`,
          message: `A DAO-wide proposal needs your vote. Voting closes in ${window.label}.`,
          context_url: '/governance',
          context_type: 'governance',
          context_id: proposal.id,
          priority: window.ms <= 6 * 60 * 60 * 1000 ? 'urgent' as const : 'high' as const,
          category: 'governance',
        }));

        const result = await sendServerNotificationBatch(payloads);
        totalSent += result.sent;
        totalSkipped += result.skipped;
      }
    }

    console.log(`[voting-reminders] Done: ${totalSent} sent, ${totalSkipped} skipped`);
    return NextResponse.json({ success: true, sent: totalSent, skipped: totalSkipped });
  } catch (err: any) {
    console.error('[voting-reminders] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

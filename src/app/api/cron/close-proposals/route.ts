// src/app/api/cron/close-proposals/route.ts
// Closes pod-level proposals whose voting deadline has passed.
//
// This is the missing close-out step the IPFS aggregation service was designed
// for but never wired to: without it, proposals stay 'proposed' forever and
// only disappear from the active list client-side.
//
// Ordering rules (the audit risk this resolves):
//   - 'approved' records the VOTE outcome only. For POD_TREASURY_BINDING
//     proposals the notification explicitly says execution is still pending —
//     the treasury tx is a separate, leader-driven step (server never sends it).
//   - The vote manifest is uploaded to IPFS first; the hash is stored with the
//     close-out. An IPFS failure is logged but does not block the close —
//     governance_votes rows remain the authoritative record either way.
//
// Schedule: every 30 minutes (see vercel.json). Idempotent: once a proposal
// leaves 'proposed'/'active' it is never reprocessed.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import type { ServerNotificationPayload } from '@/lib/serverNotifications';
import {
  determineProposalResult,
  type GovernanceTier,
} from '@/features/governance/services/proposalResultEngine';
import { requireCron } from '@/lib/cronAuth';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PINATA_JWT = process.env.PINATA_JWT;

async function uploadManifestToPinata(manifest: object, proposalId: string): Promise<string | null> {
  if (!PINATA_JWT) return null;
  try {
    const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: manifest,
        pinataMetadata: { name: `proposal-${proposalId}-votes` },
        pinataOptions: { cidVersion: 1 },
      }),
    });
    if (!response.ok) {
      console.error(`[close-proposals] Pinata upload failed for ${proposalId}:`, await response.text());
      return null;
    }
    const data = await response.json();
    return data.IpfsHash || null;
  } catch (e) {
    console.error(`[close-proposals] Pinata upload error for ${proposalId}:`, e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const results = {
    closed: [] as { id: string; result: string }[],
    ipfsFailed: [] as string[],
    errors: [] as string[],
  };

  try {
    const { data: proposals } = await supabaseAdmin
      .from('pod_level_proposals')
      .select('*, pods(name)')
      .in('status', ['proposed', 'active'])
      .not('voting_deadline', 'is', null)
      .lt('voting_deadline', new Date().toISOString());

    for (const proposal of proposals ?? []) {
      try {
        // Eligibility is enforced when a vote is written (governance_votes
        // RLS + can_vote_on_pod_proposal); the database also stamps the vote
        // time, so anything after the deadline is not counted.
        const { data: votes } = await supabaseAdmin
          .from('governance_votes')
          .select('*')
          .eq('proposal_id', proposal.id)
          .lte('timestamp', proposal.voting_deadline)
          .order('timestamp', { ascending: true });

        const tally = {
          for: votes?.filter((v) => v.vote === 'for').length || 0,
          against: votes?.filter((v) => v.vote === 'against').length || 0,
          abstain: votes?.filter((v) => v.vote === 'abstain').length || 0,
          total: votes?.length || 0,
        };

        // Pre-thresholds rows (NULL eligible_voter_count AND NULL quorum) are
        // grandfathered to the simple-majority rule they were created under.
        const grandfathered =
          proposal.eligible_voter_count == null &&
          proposal.quorum_threshold_bps == null;

        let result: 'approved' | 'rejected';
        let thresholdsBlock: object | undefined;

        if (grandfathered) {
          result = tally.for > tally.against ? 'approved' : 'rejected';
        } else {
          const tier =
            (proposal.governance_tier as GovernanceTier) ?? 'POD_OPERATIONAL';
          let eligibleVoters: number = proposal.eligible_voter_count ?? 0;
          if (proposal.eligible_voter_count == null) {
            const { count } = await supabaseAdmin
              .from('pod_members')
              .select('*', { count: 'exact', head: true })
              .eq('pod_id', proposal.pod_id)
              .eq('is_active', true);
            eligibleVoters = count || 0;
          }

          // The stored thresholds are already the resolved values from
          // creation time (pod config + any stricter override) — use them
          // as-is rather than re-maxing against platform defaults.
          const decision = determineProposalResult(
            tally,
            {
              approval_bps: proposal.approval_threshold_bps ?? 5001,
              quorum_bps: proposal.quorum_threshold_bps ?? 3000,
              voting_hours: 0,
            },
            null,
            tier,
            eligibleVoters,
          );
          result = decision.result;
          thresholdsBlock = {
            approval_bps: decision.effectiveApprovalBps,
            quorum_bps: decision.effectiveQuorumBps,
            requiredQuorum: decision.requiredQuorum,
            requiredApproval: decision.requiredApproval,
            eligibleVoters,
            quorumMet: decision.quorumMet,
            approvalMet: decision.approvalMet,
            grandfathered: false,
          };
        }

        const closedAt = new Date().toISOString();
        const manifest = {
          proposalId: proposal.id,
          podId: proposal.pod_id,
          podName: proposal.pods?.name || 'Unknown Pod',
          title: proposal.title,
          description: proposal.description,
          createdAt: proposal.created_at,
          closedAt,
          votes: (votes || []).map((v) => ({
            voter: v.voter_address,
            vote: v.vote,
            signature: v.signature || '',
            timestamp: v.timestamp,
            hat_id: v.hat_id,
          })),
          tally,
          result,
          thresholds: thresholdsBlock,
        };

        const ipfsHash = await uploadManifestToPinata(manifest, proposal.id);
        if (!ipfsHash && PINATA_JWT) results.ipfsFailed.push(proposal.id);

        const { error: updateError } = await supabaseAdmin
          .from('pod_level_proposals')
          .update({
            status: result,
            metadata: {
              ...(proposal.metadata || {}),
              ipfs_hash: ipfsHash,
              vote_counts: tally,
              close_thresholds: thresholdsBlock ?? null,
              closed_at: closedAt,
            },
          })
          .eq('id', proposal.id);

        if (updateError) {
          results.errors.push(`${proposal.id}: ${updateError.message}`);
          continue;
        }

        results.closed.push({ id: proposal.id, result });

        // Notify pod members of the outcome. For approved treasury-binding
        // proposals the message is explicit that execution has NOT happened
        // yet — approval here is the vote outcome only.
        const { data: members } = await supabaseAdmin
          .from('pod_members')
          .select('wallet')
          .eq('pod_id', proposal.pod_id)
          .eq('is_active', true);

        if (members?.length) {
          const isTreasury = proposal.governance_tier === 'POD_TREASURY_BINDING';
          const title =
            result === 'approved'
              ? isTreasury
                ? `Approved — execution pending: ${proposal.title}`
                : `Proposal approved: ${proposal.title}`
              : `Proposal rejected: ${proposal.title}`;
          const message =
            result === 'approved'
              ? isTreasury
                ? `The vote passed (${tally.for} for, ${tally.against} against). The treasury transaction still needs to be submitted by pod leadership.`
                : `The vote passed (${tally.for} for, ${tally.against} against).`
              : `The vote did not pass (${tally.for} for, ${tally.against} against).`;

          const payloads: ServerNotificationPayload[] = members.map((m) => ({
            recipient_address: m.wallet.toLowerCase(),
            sender_address: 'system',
            notification_type: 'proposal_closed',
            title,
            message,
            context_url: '/governance',
            context_type: 'governance',
            context_id: proposal.id,
            priority: 'high' as const,
            category: 'governance',
          }));
          await sendServerNotificationBatch(payloads);
        }
      } catch (e: any) {
        results.errors.push(`${proposal.id}: ${e.message}`);
      }
    }

    console.log('[close-proposals]', JSON.stringify(results));
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[close-proposals] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

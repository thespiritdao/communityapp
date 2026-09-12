// src/app/api/cron/community-agent/renewal-referendums/route.ts
//
// Congregant Phase 4: the existence referendum.
//
// "The agent is the one entity in the community that is the object of a
//  recurring existential vote and the one entity that can never cast one."
//
// Daily cron, two passes:
//
// GENERATION — for every pod with the community agent enabled:
//   - treasury-funded pods: when the subscription enters its final
//     REFERENDUM_LEAD_DAYS, open a renewal proposal (deadline = expiry)
//   - grant-funded pods (TN, Exec): recurring referendum on a cadence
//     (default 90 days); first run seeds the schedule with 14 days notice
//   The proposal is a normal pod_level_proposal (POD_TREASURY_BINDING tier)
//   — it appears in the governance UI, is voted through the normal flow, and
//   is closed/tallied by the existing close-proposals cron. Attribution is
//   'system:existence-referendum': the referendum is architecturally
//   mandated, not authored by any member — and never by the agent itself.
//
// ENFORCEMENT — for closed agent_renewal proposals not yet enforced:
//   - approved, grant-funded  → schedule next referendum, clear any pause
//   - approved, treasury      → authorize renewal payment (consumed by the
//     subscribe API; the server NEVER moves treasury funds itself — payment
//     execution stays with pod leadership, per platform rule)
//   - rejected                → paused_by_referendum: the agent falls silent.
//     No farewell post is generated: the community's decision is the outcome.
//
// Schedule: 0 6 * * * (daily, 6:00 UTC)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireCron } from '@/lib/cronAuth';
import { sendServerNotificationBatch } from '@/lib/serverNotifications';
import type { ServerNotificationPayload } from '@/lib/serverNotifications';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import {
  GRANT_FUNDED_POD_IDS,
  REFERENDUM_LEAD_DAYS,
  GRANT_REFERENDUM_CADENCE_DAYS,
} from '@/services/communityAgent/types';
import { getOrCreateAgentWallet, registerAgentOnchain } from '@/services/communityAgent/agentWalletService';
import { ensureAgentProfile } from '@/services/communityAgent/configService';

export const runtime = 'nodejs';
export const maxDuration = 120;

const SUBSCRIPTION_PRICE_SYSTEM = 25;
const SYSTEM_CREATOR = 'system:existence-referendum';

interface AgentPodRow {
  pod_id: string;
  community_agent_config: Record<string, any>;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Activity summary since a given date — the deliberation material. */
async function buildActivitySummary(podId: string, sinceIso: string): Promise<string> {
  const { data: posts } = await supabaseAdmin
    .from('community_agent_posts')
    .select('type')
    .eq('pod_id', podId)
    .gte('created_at', sinceIso);

  const counts: Record<string, number> = {};
  for (const p of posts ?? []) counts[p.type] = (counts[p.type] ?? 0) + 1;

  const lines = [
    `- Daily discussion posts: ${counts['daily_discussion'] ?? 0}`,
    `- Forum mention replies: ${counts['mention_reply'] ?? 0}`,
    `- Chat replies: ${counts['chat_reply'] ?? 0}`,
    `- Event drafts prepared: ${counts['event_creation'] ?? 0}`,
  ];
  return lines.join('\n');
}

async function notifyPodMembers(
  podId: string,
  title: string,
  message: string,
  proposalId: string | null,
) {
  const { data: members } = await supabaseAdmin
    .from('pod_members')
    .select('wallet')
    .eq('pod_id', podId)
    .eq('is_active', true);
  if (!members?.length) return;

  const payloads: ServerNotificationPayload[] = members.map((m) => ({
    recipient_address: m.wallet.toLowerCase(),
    sender_address: 'system',
    notification_type: 'proposal_created',
    title,
    message,
    context_url: '/governance',
    context_type: 'governance',
    context_id: proposalId ?? podId,
    priority: 'high' as const,
    category: 'governance',
  }));
  await sendServerNotificationBatch(payloads);
}

async function updateAgentConfig(podId: string, cfg: Record<string, any>, patch: Record<string, any>) {
  await supabaseAdmin
    .from('pod_modules')
    .update({
      community_agent_config: { ...cfg, ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq('pod_id', podId);
}

async function createRenewalProposal(opts: {
  podId: string;
  podName: string;
  cfg: Record<string, any>;
  fundedBy: 'treasury' | 'dao_grant';
  deadline: Date;
  periodStartIso: string;
}): Promise<string | null> {
  const { podId, podName, cfg, fundedBy, deadline, periodStartIso } = opts;
  const agentName = cfg.agent_name || 'Community Agent';
  const agentWallet = cfg.agent_wallet || null;

  const summary = await buildActivitySummary(podId, periodStartIso);
  const cadence = cfg.renewal_cadence_days ?? GRANT_REFERENDUM_CADENCE_DAYS;

  const fundingLine =
    fundedBy === 'treasury'
      ? `renewal costs **${SUBSCRIPTION_PRICE_SYSTEM} $SYSTEM** from the pod treasury for 30 days of operation. If approved, pod leadership executes the payment.`
      : `operation is funded by DAO grant — this vote decides continuation for the next ${cadence} days, not a payment.`;

  const description = [
    `Should **${agentName}** continue to operate as ${podName}'s community agent?`,
    ``,
    `This is the recurring existence referendum: the agent's continuation is decided by exactly the franchise from which it is excluded. ${agentName} holds no vote in this or any decision — verify at /constitution.`,
    ``,
    `**Since the last renewal, ${agentName} has produced:**`,
    summary,
    ``,
    `**Funding:** ${fundingLine}`,
    ``,
    `If a quorum votes and the majority is against, ${agentName} stops operating when the current period ends; a future proposal may reinstate it. If too few people vote to reach quorum, the pod has decided nothing and ${agentName} simply continues to the next referendum — silence is not a vote to end it.`,
  ].join('\n');

  // Snapshot eligible voters at creation (same rule close-proposals applies)
  const { count: eligibleVoters } = await supabaseAdmin
    .from('pod_members')
    .select('*', { count: 'exact', head: true })
    .eq('pod_id', podId)
    .eq('is_active', true);

  const { data: proposal, error } = await supabaseAdmin
    .from('pod_level_proposals')
    .insert({
      title: `Existence referendum: renew ${agentName}`,
      description,
      pod_id: podId,
      created_by: SYSTEM_CREATOR,
      status: 'proposed',
      voting_deadline: deadline.toISOString(),
      governance_tier: 'POD_TREASURY_BINDING',
      approval_threshold_bps: 5001,
      quorum_threshold_bps: 3000,
      eligible_voter_count: eligibleVoters ?? 0,
      metadata: {
        type: 'agent_renewal',
        agent_name: agentName,
        agent_wallet: agentWallet,
        funded_by: fundedBy,
        amount_system: fundedBy === 'treasury' ? SUBSCRIPTION_PRICE_SYSTEM : 0,
        period_days: fundedBy === 'treasury' ? 30 : cadence,
        choices: ['For', 'Against', 'Abstain'],
      },
    })
    .select('id')
    .single();

  if (error || !proposal) {
    console.error(`[RenewalReferendums] proposal insert failed for pod ${podId}:`, error);
    return null;
  }

  await notifyPodMembers(
    podId,
    `Existence referendum: ${agentName}`,
    `Should ${agentName} continue as ${podName}'s community agent? Voting closes ${deadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
    proposal.id,
  );

  recordExplorerEvent({
    type: 'proposal_created',
    title: `Existence referendum opened: ${agentName} (${podName})`,
    actor: SYSTEM_CREATOR,
    pod_id: podId,
    url: '/governance',
    metadata: { agent_renewal: true, proposal_id: proposal.id, funded_by: fundedBy },
    dedupe_key: `agent-renewal-${proposal.id}`,
  }).catch(() => {});

  return proposal.id;
}

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  const results = { created: [] as string[], enforced: [] as string[], seeded: [] as string[], errors: [] as string[] };

  try {
    const { data: pods } = await supabaseAdmin
      .from('pod_modules')
      .select('pod_id, community_agent_config')
      .eq('community_agent_enabled', true);

    const now = new Date();

    // ── GENERATION ─────────────────────────────────────────────────────────
    for (const row of (pods ?? []) as AgentPodRow[]) {
      const podId = row.pod_id;
      const cfg = row.community_agent_config || {};
      if (cfg.renewal_by_vote === false) continue; // pod opted out (explicit)

      try {
        const { data: pod } = await supabaseAdmin
          .from('pods').select('name').eq('id', podId).single();
        const podName = pod?.name || 'Unknown Pod';

        // One open referendum at a time
        if (cfg.active_renewal_proposal_id) {
          const { data: open } = await supabaseAdmin
            .from('pod_level_proposals')
            .select('status')
            .eq('id', cfg.active_renewal_proposal_id)
            .single();
          if (open && ['proposed', 'active'].includes(open.status)) continue;
        }

        const isGrantFunded = GRANT_FUNDED_POD_IDS.includes(podId);

        if (isGrantFunded) {
          // Seed the schedule on first encounter: 14 days notice before the
          // first referendum, then every `cadence` days.
          if (!cfg.next_referendum_at) {
            const first = daysFromNow(14);
            await updateAgentConfig(podId, cfg, { next_referendum_at: first.toISOString() });
            results.seeded.push(podId);
            continue;
          }

          const due = new Date(cfg.next_referendum_at);
          const windowOpens = new Date(due);
          windowOpens.setUTCDate(windowOpens.getUTCDate() - REFERENDUM_LEAD_DAYS);
          if (now < windowOpens) continue;

          const cadence = cfg.renewal_cadence_days ?? GRANT_REFERENDUM_CADENCE_DAYS;
          const periodStart = new Date(due);
          periodStart.setUTCDate(periodStart.getUTCDate() - cadence);

          const proposalId = await createRenewalProposal({
            podId, podName, cfg, fundedBy: 'dao_grant',
            deadline: due < now ? daysFromNow(REFERENDUM_LEAD_DAYS) : due,
            periodStartIso: periodStart.toISOString(),
          });
          if (proposalId) {
            await updateAgentConfig(podId, cfg, { active_renewal_proposal_id: proposalId });
            results.created.push(proposalId);
          }
        } else {
          // Treasury-funded: referendum opens when the paid period enters its
          // final week; deadline is the expiry itself.
          const { data: sub } = await supabaseAdmin
            .from('community_agent_subscriptions')
            .select('expires_at, status')
            .eq('pod_id', podId)
            .eq('status', 'active')
            .single();
          if (!sub?.expires_at) continue;

          const expires = new Date(sub.expires_at);
          if (expires < now) continue; // expired — nothing to renew by vote
          const windowOpens = new Date(expires);
          windowOpens.setUTCDate(windowOpens.getUTCDate() - REFERENDUM_LEAD_DAYS);
          if (now < windowOpens) continue;

          const periodStart = new Date(expires);
          periodStart.setUTCDate(periodStart.getUTCDate() - 30);

          const proposalId = await createRenewalProposal({
            podId, podName, cfg, fundedBy: 'treasury',
            deadline: expires,
            periodStartIso: periodStart.toISOString(),
          });
          if (proposalId) {
            await updateAgentConfig(podId, cfg, { active_renewal_proposal_id: proposalId });
            results.created.push(proposalId);
          }
        }
      } catch (e: any) {
        results.errors.push(`generate ${podId}: ${e.message}`);
      }
    }

    // ── ENFORCEMENT ────────────────────────────────────────────────────────
    const { data: closed } = await supabaseAdmin
      .from('pod_level_proposals')
      .select('*')
      .in('status', ['approved', 'rejected'])
      .eq('created_by', SYSTEM_CREATOR)
      .filter('metadata->>type', 'eq', 'agent_renewal')
      .filter('metadata->>enforced', 'is', null);

    for (const proposal of closed ?? []) {
      try {
        const podId = proposal.pod_id;
        const meta = proposal.metadata || {};
        const { data: modules } = await supabaseAdmin
          .from('pod_modules')
          .select('community_agent_config')
          .eq('pod_id', podId)
          .single();
        const cfg = modules?.community_agent_config || {};
        const agentName = meta.agent_name || cfg.agent_name || 'Community Agent';
        const isGrantFunded = meta.funded_by === 'dao_grant';
        const cadence = cfg.renewal_cadence_days ?? GRANT_REFERENDUM_CADENCE_DAYS;

        const thresholds = proposal.metadata?.close_thresholds ?? null;

        const historyEntry = {
          proposal_id: proposal.id,
          result: proposal.status,
          closed_at: proposal.metadata?.closed_at ?? new Date().toISOString(),
          tally: proposal.metadata?.vote_counts ?? null,
          // Kept so the pod can tell a defeat from a turnout failure. Without
          // it a unanimous "for" that missed quorum reads as a rejection.
          thresholds: proposal.metadata?.close_thresholds ?? null,
          funded_by: meta.funded_by,
        };
        const history = [...(cfg.renewal_history ?? []), historyEntry].slice(-12);

        if (proposal.status === 'approved') {
          if (isGrantFunded) {
            const next = new Date(cfg.next_referendum_at ?? new Date());
            next.setUTCDate(next.getUTCDate() + cadence);
            await updateAgentConfig(podId, cfg, {
              next_referendum_at: next.toISOString(),
              active_renewal_proposal_id: null,
              paused_by_referendum: null,
              renewal_history: history,
            });
          } else {
            // Authorize payment — consumed by /api/community-agent/subscribe.
            // The server never moves treasury funds; leadership executes.
            await updateAgentConfig(podId, cfg, {
              approved_renewal_proposal_id: proposal.id,
              active_renewal_proposal_id: null,
              paused_by_referendum: null,
              renewal_history: history,
            });
            const { data: pod } = await supabaseAdmin
              .from('pods').select('pod_leads, name').eq('id', podId).single();
            for (const lead of pod?.pod_leads ?? []) {
              await sendServerNotificationBatch([{
                recipient_address: lead.toLowerCase(),
                sender_address: 'system',
                notification_type: 'proposal_closed',
                title: `Renewal approved — payment needed: ${agentName}`,
                message: `The community voted to renew ${agentName}. Execute the ${SUBSCRIPTION_PRICE_SYSTEM} $SYSTEM renewal payment in the pod's agent settings to extend operation.`,
                context_url: `/pods/${podId}/manage`,
                context_type: 'pod',
                context_id: podId,
                priority: 'urgent' as const,
                category: 'governance',
              }]);
            }
          }
        } else if (thresholds?.quorumMet === false) {
          // Too few people voted for the pod to have decided anything. Closing
          // as 'rejected' is a bookkeeping artifact, not a verdict: the first
          // of these was unanimously in favour, 2 for and 0 against, and still
          // stopped the agent.
          //
          // A referendum that reaches no decision leaves things as they are.
          // Treating silence as a vote to end the agent turned a check the
          // community holds into a timer that fires on its own — the opposite
          // of "decided by exactly the franchise from which it is excluded".
          // A real majority against, with quorum, still ends it below.
          const next = new Date(cfg.next_referendum_at ?? new Date());
          next.setUTCDate(next.getUTCDate() + cadence);

          await updateAgentConfig(podId, cfg, {
            next_referendum_at: next.toISOString(),
            active_renewal_proposal_id: null,
            renewal_rejected_proposal_id: null,
            renewal_history: history,
          });

          console.log(
            `[RenewalReferendums] ${agentName}: referendum ${proposal.id} did not reach quorum ` +
              `(${proposal.metadata?.vote_counts?.total ?? 0} of ${thresholds.eligibleVoters} voted, ` +
              `${thresholds.requiredQuorum} needed). No decision — agent continues.`,
          );

          await notifyPodMembers(
            podId,
            `${agentName} continues — referendum did not reach quorum`,
            `Only ${proposal.metadata?.vote_counts?.total ?? 0} of ${thresholds.eligibleVoters} members voted, short of the ${thresholds.requiredQuorum} needed, so no decision was reached and ${agentName} keeps running. The next referendum opens ${next.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}.`,
            proposal.id,
          );
        } else {
          // A genuine decision: enough people voted, and they voted it down.
          // Grant-funded agents fall silent immediately; treasury-funded
          // agents run out their paid period and cannot be re-subscribed
          // without a new vote (subscribe API checks renewal state).
          await updateAgentConfig(podId, cfg, {
            ...(isGrantFunded ? { paused_by_referendum: true } : {}),
            renewal_rejected_proposal_id: proposal.id,
            approved_renewal_proposal_id: null,
            active_renewal_proposal_id: null,
            renewal_history: history,
          });
        }

        await supabaseAdmin
          .from('pod_level_proposals')
          .update({
            // 'executed' only for approved outcomes; rejected stays 'rejected'
            // (idempotency comes from metadata.enforced, not status)
            ...(proposal.status === 'approved' ? { status: 'executed' } : {}),
            metadata: { ...meta, enforced: true, enforced_at: new Date().toISOString() },
          })
          .eq('id', proposal.id);

        results.enforced.push(proposal.id);
      } catch (e: any) {
        results.errors.push(`enforce ${proposal.id}: ${e.message}`);
      }
    }

    // ── ADMISSION ENFORCEMENT (Phase 7): closed agent_admission proposals ──
    const { data: admissions } = await supabaseAdmin
      .from('pod_level_proposals')
      .select('*')
      .in('status', ['approved', 'rejected'])
      .filter('metadata->>type', 'eq', 'agent_admission')
      .filter('metadata->>enforced', 'is', null);

    for (const proposal of admissions ?? []) {
      try {
        const podId = proposal.pod_id;
        const meta = proposal.metadata || {};
        const { data: modules } = await supabaseAdmin
          .from('pod_modules')
          .select('community_agent_config')
          .eq('pod_id', podId)
          .single();
        const cfg = modules?.community_agent_config || {};

        if (proposal.status === 'approved') {
          // The community chose its congregant — enable the module and
          // provision the agent's real onchain identity.
          await supabaseAdmin
            .from('pod_modules')
            .update({
              community_agent_enabled: true,
              community_agent_config: {
                ...cfg,
                agent_admitted_by: proposal.id,
                admission_proposal_id: null,
                agent_name: cfg.agent_name || meta.agent_name || 'Community Agent',
              },
              updated_at: new Date().toISOString(),
            })
            .eq('pod_id', podId);

          if (process.env.AGENT_WALLET_MASTER_KEY) {
            try {
              const agentWallet = await getOrCreateAgentWallet(podId);
              registerAgentOnchain(podId, agentWallet).catch((err) =>
                console.warn('[RenewalReferendums] admission registry registration failed:', err),
              );
              await ensureAgentProfile(agentWallet, cfg.agent_name || meta.agent_name || 'Community Agent');
            } catch (err) {
              console.warn('[RenewalReferendums] admission wallet provisioning failed:', err);
            }
          }
        } else {
          // Declined — clear the pending pointer; leadership may re-propose.
          await supabaseAdmin
            .from('pod_modules')
            .update({
              community_agent_config: { ...cfg, admission_proposal_id: null },
              updated_at: new Date().toISOString(),
            })
            .eq('pod_id', podId);
        }

        await supabaseAdmin
          .from('pod_level_proposals')
          .update({
            ...(proposal.status === 'approved' ? { status: 'executed' } : {}),
            metadata: { ...meta, enforced: true, enforced_at: new Date().toISOString() },
          })
          .eq('id', proposal.id);
        results.enforced.push(proposal.id);
      } catch (e: any) {
        results.errors.push(`admission ${proposal.id}: ${e.message}`);
      }
    }

    console.log('[RenewalReferendums]', JSON.stringify(results));
    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[RenewalReferendums] Fatal error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

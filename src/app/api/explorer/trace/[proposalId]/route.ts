// src/app/api/explorer/trace/[proposalId]/route.ts
//
// GET: lineage trace for a governance decision (Congregant Phase 6).
//
// "Did the agent's prompt open the thread that became the proposal that won
//  the vote?" — answered by tracing rather than recollection.
//
// Chain: deliberation (forum thread + who opened it, human or agent)
//        → proposal (who created it, thresholds, tier)
//        → votes (each one human — verifiable)
//        → resource movement (treasury/subscription tx where applicable)
//
// Requires a session: the trace resolves wallets to member names. The
// wallet-level ledger stays public via /api/explorer/export.

import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireWallet } from '@/lib/apiPodGuard';

export const runtime = 'nodejs';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
): Promise<NextResponse> {
  const walletOrDenied = await requireWallet(req);
  if (walletOrDenied instanceof Response) return walletOrDenied;

  const { proposalId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(proposalId)) {
    return NextResponse.json({ error: 'Invalid proposal id' }, { status: 400 });
  }

  const { data: proposal } = await supabaseAdmin
    .from('pod_level_proposals')
    .select('*, pods(name)')
    .eq('id', proposalId)
    .single();

  if (!proposal) {
    return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
  }

  const meta = proposal.metadata || {};

  // ── 1. Deliberation: the forum thread the proposal emerged from ────────
  let deliberation: any = null;
  const threadId = meta.forum_thread_id || null;
  if (threadId) {
    const { data: thread } = await supabaseAdmin
      .from('forum_threads')
      .select('id, title, author_address, actor_type, created_at, reply_count')
      .eq('id', threadId)
      .maybeSingle();
    if (thread) {
      // Was the thread's author an agent? The paper's central trace question.
      const { data: authorProfile } = await supabaseAdmin
        .from('user_profiles')
        .select('first_name, last_name')
        .eq('wallet_address', (thread.author_address || '').toLowerCase())
        .maybeSingle();
      deliberation = {
        threadId: thread.id,
        title: thread.title,
        openedBy: thread.author_address,
        openedByName: authorProfile
          ? `${authorProfile.first_name ?? ''} ${authorProfile.last_name ?? ''}`.trim()
          : null,
        openedByActorType: thread.actor_type ?? 'human',
        openedAt: thread.created_at,
        replyCount: thread.reply_count ?? null,
        url: `/forum/thread/${thread.id}`,
      };
    }
  }

  // ── 2. The proposal itself ─────────────────────────────────────────────
  const isSystemProposal = (proposal.created_by || '').startsWith('system:');
  const proposalNode = {
    id: proposal.id,
    title: proposal.title,
    podName: proposal.pods?.name ?? null,
    createdBy: proposal.created_by,
    createdByActorType: isSystemProposal ? 'system' : 'human',
    createdAt: proposal.created_at,
    tier: proposal.governance_tier ?? null,
    type: meta.type ?? 'general',
    status: proposal.status,
    votingDeadline: proposal.voting_deadline,
    thresholds: meta.close_thresholds ?? null,
    ipfsHash: meta.ipfs_hash ?? null,
    ipfsUrl: meta.ipfs_hash ? `https://gateway.pinata.cloud/ipfs/${meta.ipfs_hash}` : null,
  };

  // ── 3. The votes — every one castable only by a human wallet ───────────
  const { data: votes } = await supabaseAdmin
    .from('governance_votes')
    .select('voter_address, vote, timestamp')
    .eq('proposal_id', proposalId)
    .order('timestamp', { ascending: true });

  const tally = meta.vote_counts ?? {
    for: votes?.filter((v) => v.vote === 'for').length ?? 0,
    against: votes?.filter((v) => v.vote === 'against').length ?? 0,
    abstain: votes?.filter((v) => v.vote === 'abstain').length ?? 0,
    total: votes?.length ?? 0,
  };

  // ── 4. Resource movement ───────────────────────────────────────────────
  let resourceMovement: any = null;
  if (meta.type === 'agent_renewal') {
    // Was this referendum's approval consumed by a renewal payment?
    const { data: modules } = await supabaseAdmin
      .from('pod_modules')
      .select('community_agent_config')
      .eq('pod_id', proposal.pod_id)
      .single();
    const cfg = modules?.community_agent_config || {};
    if (cfg.last_renewal_proposal_id === proposalId && cfg.last_renewal_tx) {
      resourceMovement = {
        kind: 'agent_subscription_renewal',
        amount: `${meta.amount_system ?? 25} $SYSTEM`,
        txHash: cfg.last_renewal_tx,
        txUrl: `https://basescan.org/tx/${cfg.last_renewal_tx}`,
      };
    } else if (meta.funded_by === 'dao_grant') {
      resourceMovement = { kind: 'dao_grant', note: 'Operation funded by DAO grant — continuation decided by this vote, no payment moved.' };
    } else if (proposal.status === 'executed' || proposal.status === 'approved') {
      resourceMovement = { kind: 'pending_execution', note: 'Approved — payment execution by pod leadership pending or not yet linked.' };
    }
  } else if (proposal.transaction_hash) {
    resourceMovement = {
      kind: 'onchain_execution',
      txHash: proposal.transaction_hash,
      txUrl: `https://basescan.org/tx/${proposal.transaction_hash}`,
    };
  }

  return NextResponse.json({
    chain: {
      deliberation,
      proposal: proposalNode,
      votes: {
        tally,
        voters: (votes ?? []).map((v) => ({
          address: v.voter_address,
          vote: v.vote,
          at: v.timestamp,
        })),
      },
      resourceMovement,
    },
  });
}

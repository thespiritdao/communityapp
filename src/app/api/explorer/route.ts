// src/app/api/explorer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface ExplorerEvent {
  id: string;
  type:
    | 'pod_created'
    | 'member_joined'
    | 'proposal_created'
    | 'vote_cast'
    | 'treasury_movement'
    | 'donation'
    | 'bounty_created'
    | 'bounty_completed';
  timestamp: string;
  pod_id?: string;
  pod_name?: string;
  actor?: string;
  title: string;
  amount?: string;
  url?: string;
}

const LIMIT = 40;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get('type'); // e.g. "governance" | "pods" | "treasury" | "members" | "bounties"
  const podFilter = searchParams.get('pod_id');
  const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10);

  try {
    // ── 1. Pods ────────────────────────────────────────────────────────────────
    const podEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'pods') {
      const { data: pods } = await supabaseAdmin
        .from('pods')
        .select('id, name, created_at, created_by_address, status')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(100);

      (pods ?? []).forEach((p) => {
        if (!podFilter || podFilter === p.id) {
          podEvents.push({
            id: `pod_created-${p.id}`,
            type: 'pod_created',
            timestamp: p.created_at,
            pod_id: p.id,
            pod_name: p.name,
            actor: p.created_by_address,
            title: `Pod created: ${p.name}`,
            url: `/pods/${p.id}`,
          });
        }
      });
    }

    // ── 2. Pod members + member introductions ──────────────────────────────────
    const memberEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'members') {
      const memberQuery = supabaseAdmin
        .from('pod_members')
        .select('id, pod_id, wallet, membership_type, joined_at, pods(name)')
        .eq('is_active', true)
        .order('joined_at', { ascending: false })
        .limit(100);

      if (podFilter) memberQuery.eq('pod_id', podFilter);

      const { data: members } = await memberQuery;
      (members ?? []).forEach((m: any) => {
        memberEvents.push({
          id: `member_joined-${m.id}`,
          type: 'member_joined',
          timestamp: m.joined_at,
          pod_id: m.pod_id,
          pod_name: m.pods?.name,
          actor: m.wallet,
          title: `${m.membership_type === 'leader' ? 'Leader' : 'Member'} joined ${m.pods?.name ?? 'a pod'}`,
          url: `/pods/${m.pod_id}`,
        });
      });

      // Member introductions — fired when a user first sets their name
      if (!podFilter) {
        const { data: introductions } = await supabaseAdmin
          .from('explorer_events')
          .select('id, actor, title, created_at, metadata')
          .eq('type', 'member_introduced')
          .order('created_at', { ascending: false })
          .limit(50);

        (introductions ?? []).forEach((e: any) => {
          memberEvents.push({
            id: `member_introduced-${e.id}`,
            type: 'member_joined',
            timestamp: e.created_at,
            actor: e.actor,
            title: e.title,
            url: `/members`,
          });
        });
      }
    }

    // ── 3. Proposals (pod-level) ───────────────────────────────────────────────
    const proposalEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'governance') {
      const proposalQuery = supabaseAdmin
        .from('pod_level_proposals')
        .select('id, title, created_at, created_by, pod_id, status, pods(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (podFilter) proposalQuery.eq('pod_id', podFilter);

      const { data: proposals } = await proposalQuery;
      (proposals ?? []).forEach((p: any) => {
        proposalEvents.push({
          id: `proposal_created-${p.id}`,
          type: 'proposal_created',
          timestamp: p.created_at,
          pod_id: p.pod_id,
          pod_name: p.pods?.name,
          actor: p.created_by,
          title: `Proposal: ${p.title}`,
          url: `/governance`,
        });
      });

      // DAO-wide proposals
      if (!podFilter) {
        const { data: daoProposals } = await supabaseAdmin
          .from('proposal_metadata')
          .select('id, title, created_at, proposer_address, onchain_proposal_id')
          .not('onchain_proposal_id', 'like', 'temp_%')
          .order('created_at', { ascending: false })
          .limit(50);

        (daoProposals ?? []).forEach((p: any) => {
          proposalEvents.push({
            id: `dao_proposal-${p.id}`,
            type: 'proposal_created',
            timestamp: p.created_at,
            pod_name: 'DAO-Wide',
            actor: p.proposer_address,
            title: `DAO Proposal: ${p.title}`,
            url: `/governance`,
          });
        });
      }
    }

    // ── 4. Governance votes ────────────────────────────────────────────────────
    const voteEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'governance') {
      const { data: votes } = await supabaseAdmin
        .from('governance_votes')
        .select('id, proposal_id, voter_address, vote, timestamp')
        .order('timestamp', { ascending: false })
        .limit(100);

      (votes ?? []).forEach((v: any) => {
        voteEvents.push({
          id: `vote_cast-${v.id}`,
          type: 'vote_cast',
          timestamp: v.timestamp,
          actor: v.voter_address,
          title: `Vote cast: ${v.vote} on proposal`,
          url: `/governance`,
        });
      });
    }

    // ── 5. Treasury movements ──────────────────────────────────────────────────
    const treasuryEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'treasury') {
      const treasuryQuery = supabaseAdmin
        .from('treasury_transactions')
        .select('id, type, amount_formatted, token_symbol, created_at, pod_id, sender_address, recipient_address, reason, pods(name)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100);

      if (podFilter) treasuryQuery.eq('pod_id', podFilter);

      const { data: txns } = await treasuryQuery;
      (txns ?? []).forEach((t: any) => {
        const amount = t.amount_formatted
          ? `${t.amount_formatted} ${t.token_symbol ?? ''}`
          : undefined;
        treasuryEvents.push({
          id: `treasury-${t.id}`,
          type: 'treasury_movement',
          timestamp: t.created_at,
          pod_id: t.pod_id,
          pod_name: t.pods?.name,
          actor: t.sender_address,
          title: `Treasury ${t.type}: ${amount ?? ''}${t.reason ? ` — ${t.reason}` : ''}`,
          amount,
          url: t.pod_id ? `/pods/${t.pod_id}` : undefined,
        });
      });
    }

    // ── 6. Donations (minted only — confirmed value transfer) ─────────────────
    const donationEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'treasury') {
      if (!podFilter) {
        const { data: donations } = await supabaseAdmin
          .from('pending_donations')
          .select('id, fiat_amount, minted_at, user_wallet')
          .eq('status', 'minted')
          .order('minted_at', { ascending: false })
          .limit(50);

        (donations ?? []).forEach((d: any) => {
          donationEvents.push({
            id: `donation-${d.id}`,
            type: 'donation',
            timestamp: d.minted_at,
            actor: d.user_wallet,
            title: `Donation received: $${d.fiat_amount}`,
            amount: `$${d.fiat_amount}`,
            url: `/donate`,
          });
        });
      }
    }

    // ── 7. Bounties created ────────────────────────────────────────────────────
    const bountyEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'bounties') {
      const bountyQuery = supabaseAdmin
        .from('bounties')
        .select('id, title, value_amount, value_token, creator_address, created_at, updated_at, status, pod_id, pods(name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (podFilter) bountyQuery.eq('pod_id', podFilter);

      const { data: bounties } = await bountyQuery;

      (bounties ?? []).forEach((b: any) => {
        if (b.status === 'completed') {
          bountyEvents.push({
            id: `bounty_completed-${b.id}`,
            type: 'bounty_completed',
            timestamp: b.updated_at ?? b.created_at,
            pod_id: b.pod_id,
            pod_name: b.pods?.name,
            actor: b.creator_address,
            title: `Bounty completed: ${b.title}`,
            amount: `${b.value_amount} $${b.value_token}`,
            url: `/bounty/${b.id}`,
          });
        } else {
          bountyEvents.push({
            id: `bounty_created-${b.id}`,
            type: 'bounty_created',
            timestamp: b.created_at,
            pod_id: b.pod_id,
            pod_name: b.pods?.name,
            actor: b.creator_address,
            title: `Bounty posted: ${b.title}`,
            amount: `${b.value_amount} $${b.value_token}`,
            url: `/bounty/${b.id}`,
          });
        }
      });
    }

    // ── 8. Events stats (active total + weekly) ────────────────────────────────
    // These come back as metadata in the response, not as feed items
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ count: totalActiveEvents }, { count: weeklyActiveEvents }] =
      await Promise.all([
        supabaseAdmin
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published'),
        supabaseAdmin
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published')
          .gte('created_at', oneWeekAgo),
      ]);

    // ── Merge, sort, paginate ──────────────────────────────────────────────────
    const all: ExplorerEvent[] = [
      ...podEvents,
      ...memberEvents,
      ...proposalEvents,
      ...voteEvents,
      ...treasuryEvents,
      ...donationEvents,
      ...bountyEvents,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const paginated = all.slice(offsetParam, offsetParam + LIMIT);

    return NextResponse.json({
      items: paginated,
      total: all.length,
      offset: offsetParam,
      limit: LIMIT,
      stats: {
        totalActiveEvents: totalActiveEvents ?? 0,
        weeklyActiveEvents: weeklyActiveEvents ?? 0,
      },
    });
  } catch (err) {
    console.error('[explorer] Error:', err);
    return NextResponse.json({ error: 'Failed to load explorer data' }, { status: 500 });
  }
}

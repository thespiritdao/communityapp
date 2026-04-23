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
    | 'bounty_completed'
    | 'work_submitted'
    | 'event_published'
    | 'marketplace_purchase'
    | 'hat_minted'
    | 'gift';
  timestamp: string;
  pod_id?: string;
  pod_name?: string;
  actor?: string;
  actor_address?: string;
  recipient_address?: string;
  title: string;
  amount?: string;
  url?: string;
  metadata?: Record<string, any>;
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

    // ── 2b. Hat minting events ───────────────────────────────────────────────
    const hatEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'members') {
      if (!podFilter) {
        const { data: hatMints } = await supabaseAdmin
          .from('explorer_events')
          .select('id, actor, title, created_at, metadata')
          .eq('type', 'hat_minted')
          .order('created_at', { ascending: false })
          .limit(50);

        (hatMints ?? []).forEach((e: any) => {
          hatEvents.push({
            id: `hat_minted-${e.id}`,
            type: 'hat_minted',
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
        .select('id, type, amount_formatted, token_symbol, created_at, pod_id, sender_address, recipient_address, reason, tx_hash, pods(name)')
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100);

      if (podFilter) treasuryQuery.eq('pod_id', podFilter);

      const { data: txns } = await treasuryQuery;
      (txns ?? []).forEach((t: any) => {
        const amount = t.amount_formatted
          ? `${t.amount_formatted} $${t.token_symbol ?? ''}`
          : undefined;
        treasuryEvents.push({
          id: `treasury-${t.id}`,
          type: 'treasury_movement',
          timestamp: t.created_at,
          pod_id: t.pod_id,
          pod_name: t.pods?.name,
          actor: t.sender_address,
          actor_address: t.sender_address,
          recipient_address: t.recipient_address,
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
          .select('id, fiat_amount, stripe_fee, org_fee, system_tokens_to_mint, community_tokens_to_mint, minted_at, user_wallet')
          .eq('status', 'minted')
          .order('minted_at', { ascending: false })
          .limit(50);

        (donations ?? []).forEach((d: any) => {
          const orgFee = Number(d.org_fee) || 0;
          donationEvents.push({
            id: `donation-${d.id}`,
            type: 'donation',
            timestamp: d.minted_at,
            actor: d.user_wallet,
            title: `Donation received: $${d.fiat_amount}`,
            amount: `$${d.fiat_amount}`,
            url: `/donate`,
            metadata: {
              fiatAmount: d.fiat_amount,
              stripeFee: d.stripe_fee,
              operationsFee: (orgFee / 2).toFixed(2),
              dignitiesFee: (orgFee / 2).toFixed(2),
              systemTokens: d.system_tokens_to_mint,
              communityTokens: d.community_tokens_to_mint,
            },
          });
        });
      }
    }

    // ── 6b. Peer-to-peer gifts ────────────────────────────────────────────────
    const giftEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'treasury') {
      if (!podFilter) {
        const { data: gifts } = await supabaseAdmin
          .from('gifts')
          .select('id, sender_id, recipient_id, token, amount, created_at')
          .order('created_at', { ascending: false })
          .limit(100);

        (gifts ?? []).forEach((g: any) => {
          giftEvents.push({
            id: `gift-${g.id}`,
            type: 'gift',
            timestamp: g.created_at,
            actor: g.sender_id,
            actor_address: g.sender_id,
            recipient_address: g.recipient_id,
            title: `Gift sent: ${g.amount} $${g.token}`,
            amount: `${g.amount} $${g.token}`,
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

    // ── 7b. Work submissions on bounties ────────────────────────────────────────
    const workSubmissionEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'bounties') {
      const wsQuery = supabaseAdmin
        .from('work_submissions')
        .select('id, bounty_id, submitter_address, submission_title, status, created_at, bounties(title, pod_id, pods(name))')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: submissions } = await wsQuery;

      (submissions ?? []).forEach((ws: any) => {
        const bountyTitle = ws.bounties?.title ?? 'a bounty';
        const podId = ws.bounties?.pod_id;
        const podName = ws.bounties?.pods?.name;

        if (!podFilter || podFilter === podId) {
          workSubmissionEvents.push({
            id: `work_submitted-${ws.id}`,
            type: 'work_submitted',
            timestamp: ws.created_at,
            pod_id: podId,
            pod_name: podName,
            actor: ws.submitter_address,
            title: `Work submitted: ${ws.submission_title || bountyTitle}`,
            url: `/bounty/${ws.bounty_id}`,
          });
        }
      });
    }

    // ── 8. Events (published) ──────────────────────────────────────────────────
    const eventFeedItems: ExplorerEvent[] = [];
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Always fetch published events for stats; include in feed if filter matches
    const { data: publishedEvents, count: totalActiveEvents } = await supabaseAdmin
      .from('events')
      .select('id, title, event_date, created_at, organizing_pod_id, creator_address', { count: 'exact' })
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);

    const { count: weeklyActiveEvents } = await supabaseAdmin
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .gte('created_at', oneWeekAgo);

    if (!typeFilter || typeFilter === 'events') {
      (publishedEvents ?? []).forEach((e: any) => {
        if (!podFilter || podFilter === e.organizing_pod_id) {
          eventFeedItems.push({
            id: `event_published-${e.id}`,
            type: 'event_published',
            timestamp: e.created_at,
            pod_id: e.organizing_pod_id ?? undefined,
            actor: e.creator_address,
            title: `Event: ${e.title}`,
            url: `/events`,
          });
        }
      });
    }

    // ── 9. Marketplace purchases ───────────────────────────────────────────────
    const marketplaceEvents: ExplorerEvent[] = [];
    if (!typeFilter || typeFilter === 'marketplace') {
      if (!podFilter) {
        const { data: orders } = await supabaseAdmin
          .from('marketplace_orders')
          .select('id, product_name, buyer_address, price_paid_self, price_paid_system, status, created_at')
          .not('status', 'eq', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(100);

        (orders ?? []).forEach((o: any) => {
          const tokenParts: string[] = [];
          if (o.price_paid_self && Number(o.price_paid_self) > 0) tokenParts.push(`${o.price_paid_self} $SELF`);
          if (o.price_paid_system && Number(o.price_paid_system) > 0) tokenParts.push(`${o.price_paid_system} $SYSTEM`);
          const amount = tokenParts.length > 0 ? tokenParts.join(' + ') : undefined;

          marketplaceEvents.push({
            id: `marketplace_purchase-${o.id}`,
            type: 'marketplace_purchase',
            timestamp: o.created_at,
            actor: o.buyer_address,
            title: `Purchase: ${o.product_name}`,
            amount,
            url: `/marketplace/orders/${o.id}`,
          });
        });
      }
    }

    // ── Merge, sort, paginate ──────────────────────────────────────────────────
    const merged: ExplorerEvent[] = [
      ...podEvents,
      ...memberEvents,
      ...hatEvents,
      ...proposalEvents,
      ...voteEvents,
      ...treasuryEvents,
      ...donationEvents,
      ...giftEvents,
      ...bountyEvents,
      ...workSubmissionEvents,
      ...eventFeedItems,
      ...marketplaceEvents,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // ── Resolve actor wallet addresses → display names ─────────────────────────
    const uniqueWallets = [...new Set(
      merged.map((e) => e.actor).filter(Boolean) as string[]
    )];

    let nameMap: Record<string, string> = {};
    if (uniqueWallets.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('wallet_address, first_name, last_name')
        .in('wallet_address', uniqueWallets.map((w) => w.toLowerCase()));

      (profiles ?? []).forEach((p: any) => {
        const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
        if (name) nameMap[p.wallet_address.toLowerCase()] = name;
      });
    }

    const all = merged.map((e) => ({
      ...e,
      actor: e.actor
        ? (nameMap[e.actor.toLowerCase()] ?? undefined)
        : undefined,
      // preserve raw addresses for UserProfileDisplay in the frontend
      actor_address: e.actor_address,
      recipient_address: e.recipient_address,
    }));

    const paginated = all.slice(offsetParam, offsetParam + LIMIT);

    // ── Token supply stats ────────────────────────────────────────────────────
    const { data: supplyData } = await supabaseAdmin
      .from('system_supply_metadata')
      .select('total_supply')
      .eq('id', 1)
      .single();

    return NextResponse.json({
      items: paginated,
      total: all.length,
      offset: offsetParam,
      limit: LIMIT,
      stats: {
        totalActiveEvents: totalActiveEvents ?? 0,
        weeklyActiveEvents: weeklyActiveEvents ?? 0,
      },
      tokenSupply: {
        systemTotal: supplyData?.total_supply?.toString() ?? null,
      },
    });
  } catch (err) {
    console.error('[explorer] Error:', err);
    return NextResponse.json({ error: 'Failed to load explorer data' }, { status: 500 });
  }
}

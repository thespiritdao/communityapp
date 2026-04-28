// scripts/backfill-explorer-events.ts
//
// One-time script that mirrors the 13 source queries currently performed
// by /api/explorer/route.ts and writes equivalent rows into explorer_events.
// Idempotent — every row uses a stable dedupe_key, so re-running is safe.
//
// Run with: npx tsx scripts/backfill-explorer-events.ts
//
// IMPORTANT: This depends on the 20260428000000_extend_explorer_events.sql
// migration being applied first.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface BackfillRow {
  type: string;
  category: string;
  title: string;
  actor: string | null;
  recipient_address: string | null;
  pod_id: string | null;
  amount_value: string | null;
  amount_token: string | null;
  url: string | null;
  metadata: Record<string, any>;
  created_at: string;
  dedupe_key: string;
}

let totalInserted = 0;
let totalSkipped = 0;

async function flush(rows: BackfillRow[], label: string) {
  if (rows.length === 0) {
    console.log(`  [${label}] no rows`);
    return;
  }
  // Insert one by one so a single dedupe collision doesn't kill the batch.
  // Slow but only ever runs once.
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    const { error } = await supabase.from('explorer_events').insert(row);
    if (error) {
      if (error.code === '23505') {
        skipped++;
      } else {
        console.error(`  [${label}] insert error for ${row.dedupe_key}:`, error.message);
      }
    } else {
      inserted++;
    }
  }
  totalInserted += inserted;
  totalSkipped += skipped;
  console.log(`  [${label}] inserted ${inserted}, skipped ${skipped}`);
}

async function backfillPods() {
  const { data } = await supabase
    .from('pods')
    .select('id, name, created_at, created_by_address, is_active')
    .eq('is_active', true);

  const rows: BackfillRow[] = (data ?? []).map((p: any) => ({
    type: 'pod_created',
    category: 'pods',
    title: `Pod created: ${p.name}`,
    actor: p.created_by_address?.toLowerCase() ?? null,
    recipient_address: null,
    pod_id: p.id,
    amount_value: null,
    amount_token: null,
    url: `/pods/${p.id}`,
    metadata: { pod_name: p.name },
    created_at: p.created_at,
    dedupe_key: `pod_created:${p.id}`,
  }));
  await flush(rows, 'pods');
}

async function backfillMembers() {
  const { data } = await supabase
    .from('pod_members')
    .select('id, pod_id, wallet, membership_type, joined_at, is_active, pods(name)')
    .eq('is_active', true);

  const rows: BackfillRow[] = (data ?? []).map((m: any) => ({
    type: 'member_joined',
    category: 'members',
    title: `${m.membership_type === 'leader' ? 'Leader' : 'Member'} joined ${m.pods?.name ?? 'a pod'}`,
    actor: m.wallet?.toLowerCase() ?? null,
    recipient_address: null,
    pod_id: m.pod_id,
    amount_value: null,
    amount_token: null,
    url: `/pods/${m.pod_id}`,
    metadata: { pod_name: m.pods?.name, membership_type: m.membership_type },
    created_at: m.joined_at,
    dedupe_key: `member_joined:${m.id}`,
  }));
  await flush(rows, 'members');
}

async function backfillProposalsPodLevel() {
  const { data } = await supabase
    .from('pod_level_proposals')
    .select('id, title, created_at, created_by, pod_id, pods(name)');

  const rows: BackfillRow[] = (data ?? []).map((p: any) => ({
    type: 'proposal_created',
    category: 'governance',
    title: `Proposal: ${p.title}`,
    actor: p.created_by?.toLowerCase() ?? null,
    recipient_address: null,
    pod_id: p.pod_id,
    amount_value: null,
    amount_token: null,
    url: `/governance`,
    metadata: { pod_name: p.pods?.name, source: 'pod_level' },
    created_at: p.created_at,
    dedupe_key: `proposal_created:pod_level:${p.id}`,
  }));
  await flush(rows, 'proposals (pod-level)');
}

async function backfillProposalsDaoWide() {
  const { data } = await supabase
    .from('proposal_metadata')
    .select('id, title, created_at, proposer_address, onchain_proposal_id')
    .not('onchain_proposal_id', 'like', 'temp_%');

  const rows: BackfillRow[] = (data ?? []).map((p: any) => ({
    type: 'proposal_created',
    category: 'governance',
    title: `DAO Proposal: ${p.title}`,
    actor: p.proposer_address?.toLowerCase() ?? null,
    recipient_address: null,
    pod_id: null,
    amount_value: null,
    amount_token: null,
    url: `/governance`,
    metadata: { pod_name: 'DAO-Wide', source: 'dao_wide', onchain_proposal_id: p.onchain_proposal_id },
    created_at: p.created_at,
    dedupe_key: `proposal_created:dao_wide:${p.id}`,
  }));
  await flush(rows, 'proposals (DAO-wide)');
}

async function backfillVotes() {
  const { data } = await supabase
    .from('governance_votes')
    .select('id, proposal_id, voter_address, vote, timestamp');

  const rows: BackfillRow[] = (data ?? []).map((v: any) => ({
    type: 'vote_cast',
    category: 'governance',
    title: `Vote cast: ${v.vote} on proposal`,
    actor: v.voter_address?.toLowerCase() ?? null,
    recipient_address: null,
    pod_id: null,
    amount_value: null,
    amount_token: null,
    url: `/governance`,
    metadata: { proposal_id: v.proposal_id, vote: v.vote, source: 'pod_level' },
    created_at: v.timestamp,
    dedupe_key: `vote_cast:pod_level:${v.id}`,
  }));
  await flush(rows, 'votes (pod-level)');
}

async function backfillTreasury() {
  const { data } = await supabase
    .from('treasury_transactions')
    .select('id, type, amount_formatted, token_symbol, created_at, pod_id, sender_address, recipient_address, reason, tx_hash, pods(name)')
    .eq('status', 'completed');

  const rows: BackfillRow[] = (data ?? []).map((t: any) => {
    const amountStr = t.amount_formatted
      ? `${t.amount_formatted} $${t.token_symbol ?? ''}`
      : '';
    return {
      type: 'treasury_movement',
      category: 'treasury',
      title: `Treasury ${t.type}: ${amountStr}${t.reason ? ` — ${t.reason}` : ''}`,
      actor: t.sender_address?.toLowerCase() ?? null,
      recipient_address: t.recipient_address?.toLowerCase() ?? null,
      pod_id: t.pod_id,
      amount_value: t.amount_formatted ? String(t.amount_formatted) : null,
      amount_token: t.token_symbol ?? null,
      url: t.pod_id ? `/pods/${t.pod_id}` : null,
      metadata: { pod_name: t.pods?.name, tx_hash: t.tx_hash, reason: t.reason, type: t.type },
      created_at: t.created_at,
      dedupe_key: `treasury_movement:${t.id}`,
    };
  });
  await flush(rows, 'treasury');
}

async function backfillDonations() {
  const { data } = await supabase
    .from('pending_donations')
    .select('id, fiat_amount, stripe_fee, org_fee, system_tokens_to_mint, community_tokens_to_mint, minted_at, user_wallet')
    .eq('status', 'minted');

  const rows: BackfillRow[] = (data ?? []).map((d: any) => {
    const orgFee = Number(d.org_fee) || 0;
    return {
      type: 'donation',
      category: 'treasury',
      title: `Donation received: $${d.fiat_amount}`,
      actor: d.user_wallet?.toLowerCase() ?? null,
      recipient_address: null,
      pod_id: null,
      amount_value: d.fiat_amount ? String(d.fiat_amount) : null,
      amount_token: 'USD',
      url: `/donate`,
      metadata: {
        fiatAmount: d.fiat_amount,
        stripeFee: d.stripe_fee,
        operationsFee: (orgFee / 2).toFixed(2),
        dignitiesFee: (orgFee / 2).toFixed(2),
        systemTokens: d.system_tokens_to_mint,
        communityTokens: d.community_tokens_to_mint,
      },
      created_at: d.minted_at,
      dedupe_key: `donation:${d.id}`,
    };
  });
  await flush(rows, 'donations');
}

async function backfillGifts() {
  const { data } = await supabase
    .from('gifts')
    .select('id, sender_id, recipient_id, token, amount, created_at');

  const rows: BackfillRow[] = (data ?? []).map((g: any) => ({
    type: 'gift',
    category: 'treasury',
    title: `Gift sent: ${g.amount} $${g.token}`,
    actor: g.sender_id?.toLowerCase() ?? null,
    recipient_address: g.recipient_id?.toLowerCase() ?? null,
    pod_id: null,
    amount_value: g.amount ? String(g.amount) : null,
    amount_token: g.token,
    url: null,
    metadata: {},
    created_at: g.created_at,
    dedupe_key: `gift:${g.id}`,
  }));
  await flush(rows, 'gifts');
}

async function backfillBurns() {
  const { data } = await supabase
    .from('token_claims')
    .select('id, wallet_address, system_tokens_to_burn, burned_at, status')
    .not('burned_at', 'is', null);

  const rows: BackfillRow[] = (data ?? []).map((b: any) => {
    const amount = Number(b.system_tokens_to_burn);
    return {
      type: 'burn',
      category: 'treasury',
      title: `$SYSTEM burned: ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
      actor: b.wallet_address?.toLowerCase() ?? null,
      recipient_address: null,
      pod_id: null,
      amount_value: String(amount),
      amount_token: 'SYSTEM',
      url: `/claims`,
      metadata: { status: b.status },
      created_at: b.burned_at,
      dedupe_key: `burn:${b.id}`,
    };
  });
  await flush(rows, 'burns');
}

async function backfillBounties() {
  const { data } = await supabase
    .from('bounties')
    .select('id, title, value_amount, value_token, creator_address, created_at, updated_at, status, pod_id, pods(name)');

  const rows: BackfillRow[] = (data ?? []).map((b: any) => {
    const isComplete = b.status === 'completed';
    return {
      type: isComplete ? 'bounty_completed' : 'bounty_created',
      category: 'bounties',
      title: isComplete ? `Bounty completed: ${b.title}` : `Bounty posted: ${b.title}`,
      actor: b.creator_address?.toLowerCase() ?? null,
      recipient_address: null,
      pod_id: b.pod_id,
      amount_value: b.value_amount ? String(b.value_amount) : null,
      amount_token: b.value_token,
      url: `/bounty/${b.id}`,
      metadata: { pod_name: b.pods?.name, status: b.status },
      created_at: isComplete ? (b.updated_at ?? b.created_at) : b.created_at,
      dedupe_key: isComplete ? `bounty_completed:${b.id}` : `bounty_created:${b.id}`,
    };
  });
  await flush(rows, 'bounties');
}

async function backfillWorkSubmissions() {
  const { data } = await supabase
    .from('work_submissions')
    .select('id, bounty_id, submitter_address, submission_title, status, created_at, bounties(title, pod_id, pods(name))')
    .eq('status', 'pending');

  const rows: BackfillRow[] = (data ?? []).map((ws: any) => {
    const bountyTitle = ws.bounties?.title ?? 'a bounty';
    return {
      type: 'work_submitted',
      category: 'bounties',
      title: `Work submitted: ${ws.submission_title || bountyTitle}`,
      actor: ws.submitter_address?.toLowerCase() ?? null,
      recipient_address: null,
      pod_id: ws.bounties?.pod_id ?? null,
      amount_value: null,
      amount_token: null,
      url: `/bounty/${ws.bounty_id}`,
      metadata: { pod_name: ws.bounties?.pods?.name, bounty_id: ws.bounty_id },
      created_at: ws.created_at,
      dedupe_key: `work_submitted:${ws.id}`,
    };
  });
  await flush(rows, 'work submissions');
}

async function backfillEvents() {
  const { data } = await supabase
    .from('events')
    .select('id, title, event_date, created_at, organizing_pod_id, creator_address')
    .eq('status', 'published');

  const rows: BackfillRow[] = (data ?? []).map((e: any) => ({
    type: 'event_published',
    category: 'events',
    title: `Event: ${e.title}`,
    actor: e.creator_address?.toLowerCase() ?? null,
    recipient_address: null,
    pod_id: e.organizing_pod_id ?? null,
    amount_value: null,
    amount_token: null,
    url: `/events`,
    metadata: { event_date: e.event_date },
    created_at: e.created_at,
    dedupe_key: `event_published:${e.id}`,
  }));
  await flush(rows, 'events');
}

async function backfillMarketplace() {
  const { data } = await supabase
    .from('marketplace_orders')
    .select('id, product_name, buyer_address, price_paid_self, price_paid_system, status, created_at')
    .not('status', 'eq', 'cancelled');

  const rows: BackfillRow[] = (data ?? []).map((o: any) => {
    const tokenParts: string[] = [];
    if (o.price_paid_self && Number(o.price_paid_self) > 0) tokenParts.push(`${o.price_paid_self} $SELF`);
    if (o.price_paid_system && Number(o.price_paid_system) > 0) tokenParts.push(`${o.price_paid_system} $SYSTEM`);
    return {
      type: 'marketplace_purchase',
      category: 'marketplace',
      title: `Purchase: ${o.product_name}`,
      actor: o.buyer_address?.toLowerCase() ?? null,
      recipient_address: null,
      pod_id: null,
      amount_value: null,
      amount_token: null,
      url: `/marketplace/orders/${o.id}`,
      metadata: {
        price_paid_self: o.price_paid_self,
        price_paid_system: o.price_paid_system,
        status: o.status,
        amount_display: tokenParts.join(' + '),
      },
      created_at: o.created_at,
      dedupe_key: `marketplace_purchase:${o.id}`,
    };
  });
  await flush(rows, 'marketplace');
}

async function backfillExistingExplorerEvents() {
  // The two existing explorer_events writers (member_introduced, hat_minted)
  // already wrote rows pre-migration. Backfill the new columns on those rows.
  const { data } = await supabase
    .from('explorer_events')
    .select('id, type, actor')
    .is('category', null);

  if (!data || data.length === 0) {
    console.log('  [legacy explorer_events] no rows need backfilling');
    return;
  }

  let updated = 0;
  for (const row of data) {
    let category: string | null = null;
    let dedupe: string | null = null;
    if (row.type === 'member_introduced') {
      category = 'members';
      dedupe = `member_introduced:${row.id}`;
    } else if (row.type === 'hat_minted') {
      category = 'members';
      dedupe = `hat_minted:${row.id}`;
    }
    if (!category) continue;
    const { error } = await supabase
      .from('explorer_events')
      .update({ category, dedupe_key: dedupe })
      .eq('id', row.id);
    if (!error) updated++;
  }
  console.log(`  [legacy explorer_events] updated ${updated} rows with category/dedupe_key`);
}

async function main() {
  console.log('Backfilling explorer_events from source tables...\n');

  await backfillPods();
  await backfillMembers();
  await backfillProposalsPodLevel();
  await backfillProposalsDaoWide();
  await backfillVotes();
  await backfillTreasury();
  await backfillDonations();
  await backfillGifts();
  await backfillBurns();
  await backfillBounties();
  await backfillWorkSubmissions();
  await backfillEvents();
  await backfillMarketplace();
  await backfillExistingExplorerEvents();

  console.log(`\nDone. Total inserted: ${totalInserted}, skipped (already present): ${totalSkipped}`);
}

main().catch((e) => {
  console.error('Backfill failed:', e);
  process.exit(1);
});

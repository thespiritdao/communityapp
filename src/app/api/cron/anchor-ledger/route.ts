// src/app/api/cron/anchor-ledger/route.ts
//
// Congregant Phase 6: weekly Merkle anchoring of the activity ledger.
//
// Computes a Merkle root over all explorer_events since the last anchor
// (up to the start of the current UTC day) and commits it to the LedgerAnchor
// contract on Base. Once anchored, no operator — including us — can silently
// edit an event without the mismatch being detectable by anyone.
//
// Leaf formula (keep in sync with LedgerAnchor.sol docs and the export API):
//   leaf = keccak256(utf8("{id}|{type}|{actor}|{actor_type}|{created_at}"))
// Tree: pairwise keccak256(concat(left, right)); odd node promoted unchanged.
// Events ordered by (created_at, id) ascending.
//
// Verification recipe for researchers:
//   1. GET /api/explorer/export?from=...&to=...  (same period)
//   2. Recompute leaves + root with the formula above
//   3. Compare against LedgerAnchor.anchors(index) on Basescan
//
// Schedule: 0 4 * * 1 (Mondays, 4:00 UTC)

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { requireCron } from '@/lib/cronAuth';
import { computeLeaf, computeMerkleRoot, LEAF_FORMULA } from '@/lib/ledgerMerkle';

export const runtime = 'nodejs';
export const maxDuration = 300;

const LEDGER_ANCHOR = (process.env.NEXT_PUBLIC_LEDGER_ANCHOR) as `0x${string}`;

const ANCHOR_ABI = parseAbi([
  'function anchor(bytes32 merkleRoot, uint64 periodStart, uint64 periodEnd, uint32 eventCount) external returns (uint256)',
  'function anchorCount() external view returns (uint256)',
]);

export async function GET(req: NextRequest) {
  const denied = requireCron(req);
  if (denied) return denied;

  try {
    // Period: [last anchor end (or earliest event), start of current UTC day)
    const { data: lastAnchor } = await supabaseAdmin
      .from('ledger_anchors')
      .select('period_end')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();

    let periodStart: Date;
    if (lastAnchor?.period_end) {
      periodStart = new Date(lastAnchor.period_end);
    } else {
      const { data: earliest } = await supabaseAdmin
        .from('explorer_events')
        .select('created_at')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!earliest) {
        return NextResponse.json({ success: true, message: 'No events to anchor' });
      }
      periodStart = new Date(earliest.created_at);
    }

    const periodEnd = new Date();
    periodEnd.setUTCHours(0, 0, 0, 0); // start of current UTC day — a stable boundary

    if (periodEnd <= periodStart) {
      return NextResponse.json({ success: true, message: 'Period not yet elapsed' });
    }

    // Collect the period's events (paged — periods can be large)
    const leaves: `0x${string}`[] = [];
    let eventCount = 0;
    const pageSize = 1000;
    let offset = 0;
    // Order must match the documented formula exactly
    for (;;) {
      const { data: events, error } = await supabaseAdmin
        .from('explorer_events')
        .select('id, type, actor, actor_type, created_at')
        .gte('created_at', periodStart.toISOString())
        .lt('created_at', periodEnd.toISOString())
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!events?.length) break;
      for (const e of events) leaves.push(computeLeaf(e));
      eventCount += events.length;
      if (events.length < pageSize) break;
      offset += pageSize;
    }

    if (eventCount === 0) {
      // Nothing this period — record a zero-event anchor row (no onchain tx)
      await supabaseAdmin.from('ledger_anchors').insert({
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        event_count: 0,
        merkle_root: '0x' + '0'.repeat(64),
        leaf_formula: LEAF_FORMULA,
      });
      return NextResponse.json({ success: true, eventCount: 0, anchored: false });
    }

    const merkleRoot = computeMerkleRoot(leaves);

    // Commit onchain from the pod-admin EOA (LedgerAnchor owner)
    let txHash: string | null = null;
    let onchainIndex: number | null = null;
    const adminKey = process.env.POD_ADMIN_PRIVATE_KEY;
    if (adminKey) {
      const account = privateKeyToAccount(
        (adminKey.startsWith('0x') ? adminKey : `0x${adminKey}`) as `0x${string}`,
      );
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
      const publicClient = createPublicClient({ chain: base, transport: http(rpcUrl) });
      const walletClient = createWalletClient({ account, chain: base, transport: http(rpcUrl) });

      onchainIndex = Number(
        await publicClient.readContract({
          address: LEDGER_ANCHOR, abi: ANCHOR_ABI, functionName: 'anchorCount',
        }),
      );
      txHash = await walletClient.writeContract({
        address: LEDGER_ANCHOR,
        abi: ANCHOR_ABI,
        functionName: 'anchor',
        args: [
          merkleRoot,
          BigInt(Math.floor(periodStart.getTime() / 1000)),
          BigInt(Math.floor(periodEnd.getTime() / 1000)),
          eventCount,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    } else {
      console.warn('[anchor-ledger] POD_ADMIN_PRIVATE_KEY unset — DB anchor only, no onchain commit');
    }

    const { error: insertError } = await supabaseAdmin.from('ledger_anchors').insert({
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      event_count: eventCount,
      merkle_root: merkleRoot,
      leaf_formula: LEAF_FORMULA,
      onchain_index: onchainIndex,
      tx_hash: txHash,
    });
    if (insertError) throw new Error(insertError.message);

    console.log(`[anchor-ledger] Anchored ${eventCount} events, root ${merkleRoot}, tx ${txHash}`);
    return NextResponse.json({
      success: true,
      eventCount,
      merkleRoot,
      txHash,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (err: any) {
    console.error('[anchor-ledger] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

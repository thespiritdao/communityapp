// src/app/api/self/holdings/route.ts
// Read-only current $SELF holdings for a wallet, for the identity modal +
// marketplace/bounty spend checks.
//
// V2 $SELF is soulbound ERC-1155 with per-epoch token ids, so "how much $SELF
// does this wallet have" can't be a single balanceOf. We:
//   1. Find the distinct (community_id, epoch) ids the wallet was ever minted
//      into (self_mint_queue, status 'minted'), across all its LINKED wallets.
//   2. Read decayedBalanceOf (current spendable) + balanceOf (raw) for each id
//      on SelfEpochsV2, and sum.
//
// Returns hours (1e18 wei = 1h). `spendableHours` is the decay-adjusted number
// the UI should show and that burn-to-pay would accept. Open read (governance-
// transparency data, same posture as /api/self/pod-summary).
//
// GET ?wallet=0x...                       → totals only (identity display)
// GET ?wallet=0x...&community=<uint224>&detail=1
//     → adds `holdings[]`: per-id detail for ALL the wallet's ids, each
//       { id, community, epoch, rawWei, decayBps, weightBps }, where weightBps
//       is SelfPaymentV2.effectiveWeightBps(<community>, idCommunity) — the
//       recognition weight when spending that id against the listing <community>
//       (10000 = 100% same-community; <10000 = cross-community discount; 0 =
//       not accepted). Used by the marketplace to select ids to burn via
//       payWithSelf, preferring full-weight then best cross-community weight.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, getAddress } from 'viem';
import { base } from 'viem/chains';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELF_EPOCHS = process.env.NEXT_PUBLIC_SELF_EPOCHS as
  | `0x${string}`
  | undefined;

const SELF_PAYMENT = process.env.NEXT_PUBLIC_SELF_PAYMENT as
  | `0x${string}`
  | undefined;

const PAYMENT_ABI = [
  {
    name: 'effectiveWeightBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint224' }, { type: 'uint224' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

const EPOCHS_ABI = [
  {
    name: 'decayedBalanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decayFactorBps',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

const HOUR = 10n ** 18n;
const toHours = (wei: bigint): number => Number((wei * 100n) / HOUR) / 100;

// id = (communityId << 32) | epoch  — matches SelfEpochsV2.encodeId.
const encodeId = (communityId: bigint, epoch: number): bigint =>
  (communityId << 32n) | BigInt(epoch);

export async function GET(req: NextRequest) {
  try {
    const walletParam = req.nextUrl.searchParams.get('wallet');
    if (!walletParam) {
      return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });
    }

    // Not configured yet (pre-deploy) — report zero rather than error so the UI
    // degrades gracefully.
    if (!SELF_EPOCHS) {
      return NextResponse.json({
        spendableHours: 0,
        rawHours: 0,
        configured: false,
      });
    }

    const wallet = walletParam.toLowerCase();

    // Aggregate across all the user's linked wallets (a holding may sit under
    // any address the user has linked). Resolve the canonical user, then pull
    // every linked address.
    const linked = new Set<string>([wallet]);
    const { data: walletRow } = await supabase
      .from('user_wallets')
      .select('user_id')
      .ilike('wallet_address', wallet)
      .maybeSingle();
    if (walletRow?.user_id) {
      const { data: siblings } = await supabase
        .from('user_wallets')
        .select('wallet_address')
        .eq('user_id', walletRow.user_id);
      for (const s of siblings || []) {
        if (s.wallet_address) linked.add(String(s.wallet_address).toLowerCase());
      }
    }
    const wallets = [...linked];

    // Distinct (wallet, community_id, epoch) the user was minted into.
    // ::text preserves full NUMERIC(78,0) precision (community_id is uint224).
    const { data: minted, error: mErr } = await supabase
      .from('self_mint_queue')
      .select('wallet, community_id::text, epoch')
      .in('wallet', wallets)
      .eq('status', 'minted');
    if (mErr) throw mErr;

    // Detail mode (marketplace id-selection): return ALL ids the wallet holds,
    // annotated with the recognition weight when spent against the listing
    // <community>. The marketplace prefers full-weight (same-community) ids,
    // then the best cross-community weight.
    const detail = req.nextUrl.searchParams.get('detail') === '1';
    const communityParam = req.nextUrl.searchParams.get('community');
    const listingCommunity =
      detail && communityParam ? BigInt(communityParam) : null;

    // Dedupe to distinct (holder, id) pairs.
    const seen = new Set<string>();
    const reads: {
      holder: `0x${string}`;
      id: bigint;
      community: bigint;
      epoch: number;
    }[] = [];
    for (const r of minted || []) {
      const holder = String(r.wallet);
      const community = BigInt(r.community_id);
      const id = encodeId(community, r.epoch);
      const key = `${holder.toLowerCase()}:${id.toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reads.push({ holder: getAddress(holder), id, community, epoch: r.epoch });
    }

    if (reads.length === 0) {
      return NextResponse.json({
        spendableHours: 0,
        rawHours: 0,
        spendableWei: '0',
        rawWei: '0',
        configured: true,
        ids: 0,
        ...(detail ? { holdings: [] } : {}),
      });
    }

    // One multicall round-trip: decayed + raw (+ decayBps in detail) per id.
    const contracts = reads.flatMap((r) => {
      const calls: any[] = [
        {
          address: SELF_EPOCHS,
          abi: EPOCHS_ABI,
          functionName: 'decayedBalanceOf' as const,
          args: [r.holder, r.id] as const,
        },
        {
          address: SELF_EPOCHS,
          abi: EPOCHS_ABI,
          functionName: 'balanceOf' as const,
          args: [r.holder, r.id] as const,
        },
      ];
      if (detail) {
        calls.push({
          address: SELF_EPOCHS,
          abi: EPOCHS_ABI,
          functionName: 'decayFactorBps' as const,
          args: [r.id] as const,
        });
      }
      return calls;
    });

    const results = await publicClient.multicall({ contracts, allowFailure: true });
    const perId = detail ? 3 : 2;

    let spendable = 0n;
    let raw = 0n;
    const holdings: {
      id: string;
      holder: string;
      community: string;
      epoch: number;
      rawWei: string;
      decayBps: number;
      weightBps: number;
    }[] = [];

    for (let i = 0; i < reads.length; i++) {
      const dec = results[i * perId];
      const rawRes = results[i * perId + 1];
      const rawWei =
        rawRes?.status === 'success' ? (rawRes.result as bigint) : 0n;
      if (dec?.status === 'success') spendable += dec.result as bigint;
      raw += rawWei;

      if (detail) {
        const decayRes = results[i * perId + 2];
        const decayBps =
          decayRes?.status === 'success' ? Number(decayRes.result as bigint) : 0;
        // Skip empty or fully-decayed ids — unspendable.
        if (rawWei > 0n && decayBps > 0) {
          holdings.push({
            id: reads[i].id.toString(),
            holder: reads[i].holder,
            community: reads[i].community.toString(),
            epoch: reads[i].epoch,
            rawWei: rawWei.toString(),
            decayBps,
            weightBps: 0, // filled below
          });
        }
      }
    }

    // Recognition weight vs the listing community, read once per distinct source
    // community from SelfPaymentV2.effectiveWeightBps. Same-community returns
    // 10000 (100%) even without an admin-set weight; cross-community is whatever
    // the listing community configured (0 = not accepted, e.g. pre-onboarding).
    if (detail && listingCommunity !== null && holdings.length > 0) {
      const sources = [...new Set(holdings.map((h) => h.community))];
      const weightByCommunity = new Map<string, number>();

      if (SELF_PAYMENT) {
        const weightCalls = sources.map((srcStr) => ({
          address: SELF_PAYMENT,
          abi: PAYMENT_ABI,
          functionName: 'effectiveWeightBps' as const,
          args: [listingCommunity, BigInt(srcStr)] as const,
        }));
        const weightResults = await publicClient.multicall({
          contracts: weightCalls,
          allowFailure: true,
        });
        sources.forEach((srcStr, idx) => {
          const w = weightResults[idx];
          weightByCommunity.set(
            srcStr,
            w?.status === 'success' ? Number(w.result as bigint) : 0,
          );
        });
      } else {
        // No payment contract configured: only same-community is spendable.
        for (const srcStr of sources) {
          weightByCommunity.set(
            srcStr,
            BigInt(srcStr) === listingCommunity ? 10000 : 0,
          );
        }
      }

      for (const h of holdings) {
        h.weightBps = weightByCommunity.get(h.community) ?? 0;
      }
    }

    // Keep only spendable ids (weight > 0), then order best-first: highest
    // recognition weight, then newest epoch (least decayed).
    const spendableHoldings = holdings
      .filter((h) => h.weightBps > 0)
      .sort((a, b) => b.weightBps - a.weightBps || b.epoch - a.epoch);

    return NextResponse.json({
      spendableHours: toHours(spendable),
      rawHours: toHours(raw),
      spendableWei: spendable.toString(),
      rawWei: raw.toString(),
      configured: true,
      ids: reads.length,
      ...(detail ? { holdings: spendableHoldings } : {}),
    });
  } catch (error) {
    console.error('❌ self/holdings error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}

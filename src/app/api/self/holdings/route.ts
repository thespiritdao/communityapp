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
// GET ?wallet=0x...

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

    // Dedupe to distinct (holder, id) pairs.
    const seen = new Set<string>();
    const reads: { holder: `0x${string}`; id: bigint }[] = [];
    for (const r of minted || []) {
      const holder = String(r.wallet);
      const id = encodeId(BigInt(r.community_id), r.epoch);
      const key = `${holder.toLowerCase()}:${id.toString()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      reads.push({ holder: getAddress(holder), id });
    }

    if (reads.length === 0) {
      return NextResponse.json({
        spendableHours: 0,
        rawHours: 0,
        configured: true,
        ids: 0,
      });
    }

    // One multicall round-trip: decayed + raw for every (holder, id).
    const contracts = reads.flatMap((r) => [
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
    ]);

    const results = await publicClient.multicall({ contracts, allowFailure: true });

    let spendable = 0n;
    let raw = 0n;
    for (let i = 0; i < reads.length; i++) {
      const dec = results[i * 2];
      const rawRes = results[i * 2 + 1];
      if (dec?.status === 'success') spendable += dec.result as bigint;
      if (rawRes?.status === 'success') raw += rawRes.result as bigint;
    }

    return NextResponse.json({
      spendableHours: toHours(spendable),
      rawHours: toHours(raw),
      spendableWei: spendable.toString(),
      rawWei: raw.toString(),
      configured: true,
      ids: reads.length,
    });
  } catch (error) {
    console.error('❌ self/holdings error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}

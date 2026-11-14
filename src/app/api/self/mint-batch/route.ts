// src/app/api/self/mint-batch/route.ts
// $SELF Phase 1 — batch-mint queued earnings on-chain via SelfMinter.
//
// Flow:
//   1. Caller (cron with CRON_SECRET) POSTs to drain the 'pending' mint queue
//      for a pod/epoch into one on-chain batch.
//   2. The backend SMART WALLET (signed by POD_ADMIN, configured via CDP) calls
//      SelfMinter.mintBatch as a GASLESS user operation through the Coinbase
//      paymaster — same pattern as /api/onboarding/mint-poc. Per Ron's policy,
//      ALL transactions (incl. backend) are sponsored.
//   3. On success, queue rows -> 'minted' and pod budget.minted_hours += total,
//      reflected in the ledger.
//
// IMPORTANT: the on-chain caller is the backend smart wallet
// (BACKEND_SMART_WALLET below), NOT the raw POD_ADMIN EOA. That smart wallet
// must hold ATTESTOR_ROLE on SelfMinter, and SelfMinter must be on the paymaster
// allowlist (static whitelist in /api/paymaster + Coinbase dashboard).
//
// 'exec_review' rows are NOT minted here — they require explicit Exec approval
// (a separate route/UI, §7) to flip to 'approved'/'pending' first.

import { backendSmartWallet } from '@/config/deployment.server';
import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, parseAbi, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Coinbase,
  toSmartWallet,
  sendUserOperation,
  waitForUserOperation,
} from '@coinbase/coinbase-sdk';
import { createClient } from '@supabase/supabase-js';
import { isRegisteredAgent } from '@/lib/agentGuard';

export const runtime = 'nodejs';
export const maxDuration = 60;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELF_MINTER = process.env.NEXT_PUBLIC_SELF_MINTER as `0x${string}` | undefined;

// Backend smart wallet that submits sponsored ops (same one used by mint-poc).
// It — not the POD_ADMIN EOA — is the on-chain msg.sender, so it must hold
// ATTESTOR_ROLE on SelfMinter.
// Backend CDP smart wallet (BACKEND_SMART_WALLET_ADDRESS), resolved at use time.
const BACKEND_SMART_WALLET = (): `0x${string}` => backendSmartWallet();

const MINTER_ABI = parseAbi([
  'struct MintItem { address to; uint224 communityId; uint32 epoch; uint256 amount; bytes32 sourceRef; }',
  'function mintBatch(bytes32 batchId, MintItem[] items) external',
]);

// SelfPrestige — Tenure (ecosystem-wide lifetime hours). Recorded alongside the
// mint so earning $SELF also raises the earner's permanent Tenure standing.
const SELF_PRESTIGE = process.env.NEXT_PUBLIC_SELF_PRESTIGE as `0x${string}` | undefined;
const PRESTIGE_ABI = parseAbi([
  'function batchAddLifetimeHours(address[] wallets, uint256[] hoursToAdd) external',
]);

const MAX_BATCH = 100; // bound the on-chain call size

function authorized(req: NextRequest): boolean {
  // Cron path: Bearer CRON_SECRET. Fail-CLOSED if the secret is unset.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('Authorization');
  return auth === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!SELF_MINTER) {
      return NextResponse.json(
        { error: 'SELF_MINTER not configured' },
        { status: 500 },
      );
    }
    // Sponsored-op credentials (same set as mint-poc).
    const ATTESTOR_KEY =
      process.env.SELF_ATTESTOR_PRIVATE_KEY || process.env.POD_ADMIN_PRIVATE_KEY;
    const paymasterUrl = process.env.NEXT_PUBLIC_PAYMASTER;
    const cdpApiKey = process.env.CDP_API_KEY;
    let cdpPrivateKey = process.env.EXECUTIVE_MINTING_PRIVATE_KEY;
    if (!ATTESTOR_KEY || !paymasterUrl || !cdpApiKey || !cdpPrivateKey) {
      return NextResponse.json(
        { error: 'Server configuration error: signer/paymaster/CDP creds missing' },
        { status: 500 },
      );
    }
    if (cdpPrivateKey.includes('\\n')) cdpPrivateKey = cdpPrivateKey.replace(/\\n/g, '\n');

    const { podId, epoch } = await req.json();
    if (!podId || epoch === undefined || epoch === null) {
      return NextResponse.json(
        { error: 'Missing required fields: podId, epoch' },
        { status: 400 },
      );
    }

    // Pull mintable rows (status 'pending' or Exec-'approved'; NOT exec_review).
    // CRITICAL: cast the big NUMERIC columns to text. PostgREST returns bare
    // NUMERIC as JSON numbers, and the supabase client parses them as JS floats
    // — which silently truncates 67-digit communityId / 1e18 hours precision
    // BEFORE BigInt() can see them. Casting to ::text preserves full precision.
    const { data: rows, error: rowsErr } = await supabase
      .from('self_mint_queue')
      .select('id, wallet, community_id::text, epoch, hours::text')
      .eq('pod_id', podId)
      .eq('epoch', epoch)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: true })
      .limit(MAX_BATCH);
    if (rowsErr) throw rowsErr;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: true, minted: 0, message: 'No mintable rows' });
    }

    // Constitutional exclusion: registered AI agents accrue no $SELF/Tenure.
    // Agent rows are rejected (not left pending — they would retry forever).
    const agentRows = [];
    const humanRows = [];
    for (const r of rows) {
      if (await isRegisteredAgent(r.wallet)) agentRows.push(r);
      else humanRows.push(r);
    }
    if (agentRows.length > 0) {
      console.warn(`[self/mint-batch] rejecting ${agentRows.length} agent-address row(s):`,
        agentRows.map((r) => r.wallet).join(', '));
      await supabase
        .from('self_mint_queue')
        .update({ status: 'rejected', anomaly_flags: ['agent_address'] })
        .in('id', agentRows.map((r) => r.id));
    }
    if (humanRows.length === 0) {
      return NextResponse.json({ success: true, minted: 0, message: 'Only agent rows (rejected)' });
    }
    const mintableRows = humanRows;

    // Build the on-chain items + a deterministic batchId (replay-safe).
    const items = mintableRows.map((r) => ({
      to: r.wallet as `0x${string}`,
      communityId: BigInt(r.community_id),
      epoch: Number(r.epoch),
      amount: BigInt(r.hours),
      // sourceRef = keccak256(queue row id) — ties the on-chain mint to the row.
      sourceRef: keccak256(toBytes(r.id)) as `0x${string}`,
    }));
    const idConcat = mintableRows.map((r) => r.id).join('|');
    const batchId = keccak256(toBytes(`${podId}:${epoch}:${idConcat}`)) as `0x${string}`;
    const totalHours = mintableRows.reduce((acc, r) => acc + BigInt(r.hours), 0n);

    // Prestige (Tenure) is ecosystem-wide PER WALLET — aggregate this batch's
    // hours per recipient so a wallet earning from multiple rows gets one
    // lifetime-hours bump. Recorded in the SAME user op as the mint (atomic).
    const prestigeByWallet = new Map<string, bigint>();
    for (const r of mintableRows) {
      const w = (r.wallet as string).toLowerCase();
      prestigeByWallet.set(w, (prestigeByWallet.get(w) ?? 0n) + BigInt(r.hours));
    }
    const prestigeWallets = [...prestigeByWallet.keys()] as `0x${string}`[];
    const prestigeHours = [...prestigeByWallet.values()];

    // Submit as a GASLESS user operation via the backend smart wallet + paymaster
    // (same pattern as mint-poc). The smart wallet is the on-chain caller and
    // must hold ATTESTOR_ROLE on SelfMinter.
    Coinbase.configure({ apiKeyName: cdpApiKey, privateKey: cdpPrivateKey });
    const signer = privateKeyToAccount(
      ATTESTOR_KEY.startsWith('0x')
        ? (ATTESTOR_KEY as `0x${string}`)
        : (`0x${ATTESTOR_KEY}` as `0x${string}`),
    );
    const wallet = toSmartWallet({
      smartWalletAddress: BACKEND_SMART_WALLET(),
      signer,
    });

    const mintCall = {
      to: SELF_MINTER,
      data: encodeFunctionData({
        abi: MINTER_ABI,
        functionName: 'mintBatch',
        args: [batchId, items],
      }),
      value: 0n,
    };

    // Both calls go in ONE user op → mint $SELF AND raise Tenure atomically.
    // (The backend smart wallet holds JANITOR_ROLE on SelfPrestige.) If
    // SelfPrestige isn't configured, mint still proceeds without prestige.
    const calls = [mintCall];
    if (SELF_PRESTIGE && prestigeWallets.length > 0) {
      calls.push({
        to: SELF_PRESTIGE,
        data: encodeFunctionData({
          abi: PRESTIGE_ABI,
          functionName: 'batchAddLifetimeHours',
          args: [prestigeWallets, prestigeHours],
        }),
        value: 0n,
      });
    }

    const result = await sendUserOperation(wallet, {
      calls,
      chainId: 8453,
      paymasterUrl,
    });
    const opReceipt = await waitForUserOperation({
      userOpHash: result.userOpHash,
      smartWalletAddress: wallet.address,
    });
    const txHash = (opReceipt as any).transaction_hash || result.userOpHash;
    if ((opReceipt as any).status && (opReceipt as any).status !== 'complete') {
      return NextResponse.json(
        { error: 'Mint batch user op did not complete', txHash },
        { status: 500 },
      );
    }

    // Reflect in the ledger: rows -> minted; budget.minted_hours += total.
    const rowIds = mintableRows.map((r) => r.id);
    await supabase
      .from('self_mint_queue')
      .update({
        status: 'minted',
        batch_id: batchId,
        tx_hash: txHash,
        minted_at: new Date().toISOString(),
      })
      .in('id', rowIds);

    // Increment pod budget minted_hours (read-modify-write; the cron is the
    // single writer per pod/epoch so no concurrent-batch race in practice).
    const { data: budget } = await supabase
      .from('pod_self_budgets')
      .select('minted_hours::text') // full precision for the read-modify-write
      .eq('pod_id', podId)
      .eq('epoch', epoch)
      .maybeSingle();
    if (budget) {
      await supabase
        .from('pod_self_budgets')
        .update({
          minted_hours: (BigInt(budget.minted_hours) + totalHours).toString(),
          updated_at: new Date().toISOString(),
        })
        .eq('pod_id', podId)
        .eq('epoch', epoch);
    }

    return NextResponse.json({
      success: true,
      minted: mintableRows.length,
      totalHours: totalHours.toString(),
      batchId,
      txHash,
    });
  } catch (error) {
    console.error('❌ self/mint-batch error:', error);
    return NextResponse.json(
      {
        error: 'Mint batch failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

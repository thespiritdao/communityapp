// src/app/api/admin/self/route.ts
// Exec-Pod-only admin API for the $SELF system: budgets, mint review queue,
// and epoch state. Mirrors /api/admin/tokens security exactly:
//   1. JWT-verify caller wallet.
//   2. Re-check EXECUTIVE_POD_LEADER hat ON-CHAIN (UI gate is not the boundary).
//   3. Only then read/write with the service-role client.
//
// GET                      → { budgets[], reviewQueue[], epoch }
// POST { action:'setBudget', podId, epoch, hours, source? }
// POST { action:'reviewMint', mintId, decision:'approved'|'rejected' }
// POST { action:'advanceEpoch' }   (signs SelfEpochs.advanceEpoch via admin key)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  parseAbi,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import jwt from 'jsonwebtoken';
import { getHatId } from '@/lib/hatRegistry';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const SELF_EPOCHS = process.env.NEXT_PUBLIC_SELF_EPOCHS as `0x${string}` | undefined;
const publicClient = createPublicClient({ chain: base, transport: http() });

const HATS_ABI = [
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const EPOCHS_ABI = parseAbi([
  'function currentEpoch() view returns (uint32)',
  'function lifetimeEpochs() view returns (uint32)',
  'function advanceEpoch() external',
]);

const HOUR = 10n ** 18n;

function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

async function requireExec(
  req: NextRequest,
): Promise<{ ok: true; wallet: string } | { ok: false; res: NextResponse }> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const wallet = getWalletFromToken(token);
  if (!wallet) {
    return { ok: false, res: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) };
  }
  const execHatId = await getHatId('EXECUTIVE_POD_LEADER');
  if (!execHatId) {
    return { ok: false, res: NextResponse.json({ error: 'Executive hat not configured' }, { status: 500 }) };
  }
  const balance = (await publicClient.readContract({
    address: HATS_PROTOCOL_ADDRESS as `0x${string}`,
    abi: HATS_ABI,
    functionName: 'balanceOf',
    args: [getAddress(wallet), BigInt(execHatId)],
  })) as bigint;
  if (balance === 0n) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden: Executive Pod role required' }, { status: 403 }) };
  }
  return { ok: true, wallet };
}

export async function GET(req: NextRequest) {
  const auth = await requireExec(req);
  if (!auth.ok) return auth.res;

  const [{ data: budgets }, { data: reviewQueue }, { data: pods }] = await Promise.all([
    supabaseAdmin
      .from('pod_self_budgets')
      .select('id, pod_id, epoch, allocated_hours, minted_hours, source')
      .order('epoch', { ascending: false }),
    supabaseAdmin
      .from('self_mint_queue')
      .select('id, wallet, pod_id, epoch, hours, source_type, source_ref, anomaly_flags, created_at')
      .eq('status', 'exec_review')
      .order('created_at', { ascending: true }),
    supabaseAdmin.from('pods').select('id, name').eq('is_active', true),
  ]);

  let epoch: { current: number; lifetime: number } | null = null;
  if (SELF_EPOCHS) {
    try {
      const [c, k] = await Promise.all([
        publicClient.readContract({ address: SELF_EPOCHS, abi: EPOCHS_ABI, functionName: 'currentEpoch' }),
        publicClient.readContract({ address: SELF_EPOCHS, abi: EPOCHS_ABI, functionName: 'lifetimeEpochs' }),
      ]);
      epoch = { current: Number(c), lifetime: Number(k) };
    } catch {
      /* SelfEpochs unreachable — leave null */
    }
  }

  return NextResponse.json({
    budgets: budgets || [],
    reviewQueue: reviewQueue || [],
    pods: pods || [],
    epoch,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireExec(req);
  if (!auth.ok) return auth.res;

  const body = await req.json();
  const action = body.action as string;

  // ── Set / adjust a pod budget ──────────────────────────────────────────────
  if (action === 'setBudget') {
    const { podId, epoch, hours, source } = body;
    if (!podId || epoch === undefined || hours === undefined) {
      return NextResponse.json({ error: 'Missing podId, epoch, or hours' }, { status: 400 });
    }
    const allocatedWei = (BigInt(Math.max(0, Math.floor(Number(hours)))) * HOUR).toString();
    const { error } = await supabaseAdmin.from('pod_self_budgets').upsert(
      {
        pod_id: podId,
        epoch: Number(epoch),
        allocated_hours: allocatedWei,
        source: source || 'algorithmic',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'pod_id,epoch' },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── Approve / reject a flagged mint ────────────────────────────────────────
  if (action === 'reviewMint') {
    const { mintId, decision } = body;
    if (!mintId || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json({ error: 'Missing mintId or invalid decision' }, { status: 400 });
    }
    // Only flip rows still in exec_review (idempotent / no double-handling).
    const { error } = await supabaseAdmin
      .from('self_mint_queue')
      .update({ status: decision })
      .eq('id', mintId)
      .eq('status', 'exec_review');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── Advance the global epoch (IRREVERSIBLE) ────────────────────────────────
  if (action === 'advanceEpoch') {
    if (!SELF_EPOCHS) {
      return NextResponse.json({ error: 'SelfEpochs not configured' }, { status: 500 });
    }
    const key = process.env.ADMIN_EPOCH_PRIVATE_KEY || process.env.POD_ADMIN_PRIVATE_KEY;
    if (!key) return NextResponse.json({ error: 'Epoch admin key missing' }, { status: 500 });
    const account = privateKeyToAccount((key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`);
    const rpc = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
    const walletClient = createWalletClient({ account, chain: base, transport: http(rpc) });
    try {
      const hash = await walletClient.writeContract({
        address: SELF_EPOCHS,
        abi: EPOCHS_ABI,
        functionName: 'advanceEpoch',
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        return NextResponse.json({ error: 'advanceEpoch reverted', hash }, { status: 500 });
      }
      const current = await publicClient.readContract({
        address: SELF_EPOCHS,
        abi: EPOCHS_ABI,
        functionName: 'currentEpoch',
      });
      return NextResponse.json({ success: true, hash, epoch: Number(current) });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'advanceEpoch failed' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

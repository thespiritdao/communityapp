// src/app/api/pods/review/route.ts
// Exec-only: activate or veto a pending pod proposal on PodCreationManagerV2.
// Caller must wear the exec hat — verified server-side via on-chain balanceOf.

import { type NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';
import { getHatId } from '@/lib/hatRegistry';
import jwt from 'jsonwebtoken';

export const runtime = 'nodejs';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const POD_CREATION_MANAGER = process.env.NEXT_PUBLIC_POD_CREATION_MANAGER as `0x${string}`;
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;

const POD_MANAGER_ABI = [
  {
    name: 'activatePod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'vetoPod',
    type: 'function',
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'reason', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'wearer', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

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

export async function POST(req: NextRequest) {
  try {
    // Auth
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { podId, action, reason } = await req.json();

    if (!podId || !action || !['activate', 'veto'].includes(action)) {
      return NextResponse.json({ error: 'Missing or invalid fields: podId, action (activate|veto)' }, { status: 400 });
    }

    if (!POD_CREATION_MANAGER) {
      return NextResponse.json({ error: 'POD_CREATION_MANAGER not configured' }, { status: 500 });
    }

    const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!ADMIN_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error: no admin key' }, { status: 500 });
    }

    const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

    // Verify caller wears exec hat on-chain
    const execHatId = await getHatId('EXECUTIVE_POD_LEADER');
    if (!execHatId) {
      return NextResponse.json({ error: 'Executive Pod Leader hat not configured' }, { status: 500 });
    }

    const balance = await publicClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [callerAddress as `0x${string}`, BigInt(execHatId)],
    });

    if ((balance as bigint) === 0n) {
      return NextResponse.json({ error: 'Forbidden: caller does not wear the Executive Pod Leader hat' }, { status: 403 });
    }

    // Execute on-chain via admin wallet
    const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({ account: adminAccount, chain: base, transport: http(RPC_URL) });

    let hash: `0x${string}`;
    if (action === 'activate') {
      hash = await walletClient.writeContract({
        address: POD_CREATION_MANAGER,
        abi: POD_MANAGER_ABI,
        functionName: 'activatePod',
        args: [podId],
      });
    } else {
      hash = await walletClient.writeContract({
        address: POD_CREATION_MANAGER,
        abi: POD_MANAGER_ABI,
        functionName: 'vetoPod',
        args: [podId, reason || 'Vetoed by exec'],
      });
    }

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== 'success') {
      throw new Error(`${action} transaction failed on-chain`);
    }

    // Update DB
    if (action === 'activate') {
      await supabaseAdmin
        .from('pods')
        .update({ status: 'active', is_active: true, updated_at: new Date().toISOString() })
        .eq('id', podId);
    } else {
      await supabaseAdmin
        .from('pods')
        .update({ status: 'vetoed', is_active: false, updated_at: new Date().toISOString() })
        .eq('id', podId);
    }

    return NextResponse.json({ success: true, action, txHash: hash });
  } catch (err: any) {
    console.error('Pod review API error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

// GET: list pending pods for exec review
export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const callerAddress = getWalletFromToken(token);
    if (!callerAddress) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { data: pods, error } = await supabaseAdmin
      .from('pods')
      .select('id, name, description, pod_leads, created_by_address, pod_image_url, pod_metadata, created_at, status')
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ pods: pods || [] });
  } catch (err: any) {
    console.error('Pod review list error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

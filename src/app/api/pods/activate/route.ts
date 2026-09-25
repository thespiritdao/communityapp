import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { recordExplorerEvent } from '@/lib/explorerEvents';
import { verifySessionTokenOrThrow } from '@/lib/verifySessionToken';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
const HATS_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

async function getWalletFromToken(token: string | undefined): Promise<string | null> {
  try {
    if (!token) return null;
    const payload = (await verifySessionTokenOrThrow(token)) as any;
    return payload.wallet_address || payload.user_metadata?.wallet_address || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('🏦 Pod activation request:', body);

    const { podId, treasuryAddress, isActive } = body;

    if (!podId) {
      return NextResponse.json({ error: 'Missing podId' }, { status: 400 });
    }

    // ── Auth: require a valid session and pod leadership ──────────────────────
    // This route flips is_active / registers a treasury; it must not be callable
    // anonymously. Verify the caller, then confirm they lead this pod (wears the
    // management hat on-chain, or is listed in pod_leads as a fallback).
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const callerAddress = await getWalletFromToken(token);
    if (!callerAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: podRow, error: podLookupError } = await supabase
      .from('pods')
      .select('management_hat_id, pod_leads')
      .eq('id', podId)
      .single();
    if (podLookupError || !podRow) {
      return NextResponse.json({ error: 'Pod not found' }, { status: 404 });
    }

    let isLeader =
      Array.isArray(podRow.pod_leads) &&
      podRow.pod_leads.some(
        (l: string) => l?.toLowerCase() === callerAddress.toLowerCase(),
      );

    if (!isLeader && HATS_CONTRACT) {
      try {
        const publicClient = createPublicClient({
          chain: base,
          transport: http(RPC_URL),
        });
        // Pod management hat, OR the Executive Pod Leader hat: execs
        // legitimately deploy/register treasuries on behalf of pods.
        const { getHatId } = await import('@/lib/hatRegistry');
        const execHatId = await getHatId('EXECUTIVE_POD_LEADER');
        const hatIds = [podRow.management_hat_id, execHatId].filter(Boolean);
        for (const hatId of hatIds) {
          const balance = (await publicClient.readContract({
            address: HATS_CONTRACT,
            abi: HATS_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [callerAddress as `0x${string}`, BigInt(hatId as string)],
          })) as bigint;
          if (balance > 0n) {
            isLeader = true;
            break;
          }
        }
      } catch (e) {
        console.warn('🏦 hat authorization check failed:', e);
      }
    }

    if (!isLeader) {
      return NextResponse.json(
        { error: 'Forbidden: only a pod leader or executive can activate this pod' },
        { status: 403 },
      );
    }

    // Update pod with treasury information
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (treasuryAddress) {
      updateData.treasury_contract_address = treasuryAddress;
      updateData.treasury_deployed_at = new Date().toISOString();
      updateData.is_active = true;
    }

    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    const { data, error } = await supabase
      .from('pods')
      .update(updateData)
      .eq('id', podId)
      .select();

    if (error) {
      console.error('🏦 Database update error:', error);
      return NextResponse.json(
        {
          error: `Database error: ${error.message}`,
        },
        { status: 500 },
      );
    }

    if (!data || data.length === 0) {
      return NextResponse.json(
        {
          error: 'Pod not found',
        },
        { status: 404 },
      );
    }

    console.log('🏦 Pod updated successfully:', data[0]);

    // Pulse: log activation only when the pod actually transitions to active.
    // The dedupe_key on pod_id keeps re-activations idempotent.
    if (data[0].is_active) {
      recordExplorerEvent({
        type: 'pod_activated',
        title: `Pod activated: ${data[0].name ?? 'Unnamed'}`,
        actor: data[0].created_by_address ?? null,
        pod_id: podId,
        url: `/pods/${podId}`,
        metadata: {
          pod_name: data[0].name,
          treasury_address: data[0].treasury_contract_address ?? null,
        },
        dedupe_key: `pod_activated:${podId}`,
      }).catch((err) => console.warn('[pods/activate] explorer event failed:', err));
    }

    return NextResponse.json({
      ok: true,
      message: treasuryAddress
        ? 'Treasury deployed and registered successfully'
        : 'Pod updated successfully',
      pod: data[0],
    });
  } catch (e: any) {
    console.error('🏦 Pod activation error:', e);
    return NextResponse.json(
      {
        error: e?.message || 'Failed to process request',
      },
      { status: 500 },
    );
  }
}

// src/lib/serverPodAuth.ts
// Shared server-side auth helpers for API routes: JWT → wallet, pod
// leadership, and the on-chain Executive Pod Leader check. Mirrors the
// checks in /api/pods/[id]/modules — extracted so new routes don't copy
// them a fourth time. SERVER ONLY (imports the service-role client).

import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '@/utils/supabaseAdminClient';

export function getWalletFromToken(token: string): string | null {
  try {
    const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
    if (!JWT_SECRET) return null;
    const payload = jwt.verify(token, JWT_SECRET) as any;
    return (
      payload.wallet_address || payload.user_metadata?.wallet_address || null
    );
  } catch {
    return null;
  }
}

export function getWalletFromRequest(req: Request): string | null {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  return getWalletFromToken(token);
}

export async function isPodLeader(
  podId: string,
  wallet: string,
): Promise<boolean> {
  // Audit Phase 1: one definition of "leader", decided from the management
  // hat on-chain first (see src/lib/podAuthority.ts). pods.pod_leads and the
  // creator still count — members cannot write those columns — but
  // pod_members.role no longer decides anything unless the chain is
  // unreachable.
  const { isPodLead } = await import('@/lib/podAuthority');
  return isPodLead(wallet, podId);
}

/**
 * Is this wallet an active member (any role, including leader) of the pod?
 * DB-backed: `pod_members.is_active` OR listed in `pods.pod_leads`.
 */
export async function isPodMember(
  podId: string,
  wallet: string,
): Promise<boolean> {
  const w = wallet.toLowerCase();
  const { data: member } = await supabaseAdmin
    .from('pod_members')
    .select('id')
    .eq('pod_id', podId)
    .eq('wallet', w)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (member) return true;
  return isPodLeader(podId, w);
}

/** Does this wallet wear the Executive Pod Leader hat on-chain? */
export async function isExecutiveLeader(wallet: string): Promise<boolean> {
  try {
    const { getHatId } = await import('@/lib/hatRegistry');
    const execHatId = await getHatId('EXECUTIVE_POD_LEADER');
    if (!execHatId) return false;

    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');
    const HATS = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
    if (!HATS) return false;

    const client = createPublicClient({
      chain: base,
      transport: http(
        process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
      ),
    });
    const balance = (await client.readContract({
      address: HATS,
      abi: [
        {
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            { name: 'account', type: 'address' },
            { name: 'id', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ] as const,
      functionName: 'balanceOf',
      args: [wallet as `0x${string}`, BigInt(execHatId)],
    })) as bigint;
    return balance > 0n;
  } catch {
    // Fail closed.
    return false;
  }
}

/**
 * API Route: Check Bounty Permissions (V3)
 *
 * For BountyManagerV3: Reads permissions directly from contract
 * Uses Hats Protocol to verify leader status
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const BOUNTY_MANAGER_V3_ADDRESS = process.env
  .NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS as `0x${string}`;

const BountyManagerV3ABI = [
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    name: 'canManageBounties',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'podId', type: 'string' }],
    name: 'isValidPod',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'podId', type: 'string' }],
    name: 'getPodTreasuryAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = searchParams.get('user');
    const podId = searchParams.get('pod');
    const action = searchParams.get('action'); // 'manage' or 'treasury'

    if (!user || !podId || !action) {
      return NextResponse.json(
        { error: 'Missing required parameters: user, pod, action' },
        { status: 400 },
      );
    }

    if (!BOUNTY_MANAGER_V3_ADDRESS) {
      return NextResponse.json(
        { error: 'BountyManagerV3 not deployed' },
        { status: 503 },
      );
    }

    console.log(`🔍 Checking V3 permission: ${action} for ${user} on ${podId}`);

    // Check if pod is registered in V3 contract
    const isValidPod = await publicClient.readContract({
      address: BOUNTY_MANAGER_V3_ADDRESS,
      abi: BountyManagerV3ABI,
      functionName: 'isValidPod',
      args: [podId],
    });

    if (!isValidPod) {
      console.log(`⚠️ Pod ${podId} not registered in BountyManagerV3`);
      return NextResponse.json({
        canManage: false,
        error: 'Pod not registered',
      });
    }

    // Check permission via contract
    const canManage = await publicClient.readContract({
      address: BOUNTY_MANAGER_V3_ADDRESS,
      abi: BountyManagerV3ABI,
      functionName: 'canManageBounties',
      args: [user as `0x${string}`, podId],
    });

    console.log(`✅ Permission result: ${canManage}`);

    return NextResponse.json({
      canManage,
      isPodRegistered: isValidPod,
      contractVersion: 'V3',
    });
  } catch (error) {
    console.error('❌ Error checking V3 permissions:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        canManage: false,
      },
      { status: 500 },
    );
  }
}

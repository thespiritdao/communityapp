/**
 * API Route: Sync Pod Members
 *
 * Triggers member indexing for a specific pod to sync on-chain HAT ownership
 * to the pod_members database table.
 *
 * This is needed when:
 * - A user receives a HAT token but it's not reflected in the database
 * - The automatic indexer hasn't run yet
 * - Manual verification is needed
 */

import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { PodOperationsService } from '@/features/pods/services/PodOperationsService';

export async function POST(request: NextRequest) {
  try {
    const { podId } = await request.json();

    if (!podId) {
      return NextResponse.json(
        { error: 'Pod ID is required' },
        { status: 400 }
      );
    }

    console.log(`🔄 Syncing members for pod: ${podId}`);

    // Create public client for blockchain reads
    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0]),
    });

    // Initialize service
    const service = new PodOperationsService(publicClient as any);

    // Trigger indexing
    const result = await service.triggerMemberIndexing(podId);

    console.log(`✅ Sync completed for pod ${podId}:`, result);

    return NextResponse.json({
      success: true,
      podId,
      membersAdded: result.membersAdded,
      membersRemoved: result.membersRemoved,
      errors: result.errors,
      message: `Synced ${result.membersAdded} members (removed ${result.membersRemoved} stale members)`,
    });
  } catch (error) {
    console.error('❌ Failed to sync pod members:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

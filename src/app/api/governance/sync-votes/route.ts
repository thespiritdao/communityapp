// API Route: Sync governance votes from blockchain to database
// Call this manually or via cron job to backfill/update vote counts

import { NextRequest, NextResponse } from 'next/server';
import { syncHistoricalVotes } from '@/features/governance/services/voteEventSync';

export async function POST(request: NextRequest) {
  try {
    // Optional: Add authentication check here
    // const session = await getServerSession();
    // if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { fromBlock, toBlock } = body;

    if (!fromBlock || !toBlock) {
      return NextResponse.json(
        { error: 'Missing fromBlock or toBlock parameters' },
        { status: 400 }
      );
    }

    console.log(`📡 API: Syncing votes from block ${fromBlock} to ${toBlock}`);

    await syncHistoricalVotes(BigInt(fromBlock), BigInt(toBlock));

    return NextResponse.json({
      success: true,
      message: `Synced votes from block ${fromBlock} to ${toBlock}`,
    });
  } catch (error: any) {
    console.error('❌ API: Failed to sync votes:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync votes' },
      { status: 500 }
    );
  }
}

// GET route to sync recent votes (last 100k blocks)
export async function GET(request: NextRequest) {
  try {
    const { createPublicClient, http } = await import('viem');
    const { base } = await import('viem/chains');

    const publicClient = createPublicClient({
      chain: base,
      transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org'),
    });

    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock - 100000n; // Last ~2.3 days

    console.log(`📡 API: Auto-syncing votes from block ${fromBlock} to ${currentBlock}`);

    await syncHistoricalVotes(fromBlock, currentBlock);

    return NextResponse.json({
      success: true,
      message: `Synced votes from block ${fromBlock} to ${currentBlock}`,
      blocksProcessed: Number(currentBlock - fromBlock),
    });
  } catch (error: any) {
    console.error('❌ API: Failed to auto-sync votes:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync votes' },
      { status: 500 }
    );
  }
}

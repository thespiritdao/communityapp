import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { requireCron } from '@/lib/cronAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Create public client to fetch transaction receipts
const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
  '0x8Af29E57A962216C4661c36737CbF33510356DAD') as `0x${string}`;

const BOUNTY_CREATED_TOPIC = '0x53902e1474335a04152927f2e2b4e98a09b6a6f269fbab584d6ec3b22176995c';

// CDP Bundler URL for querying userOperation status
const BUNDLER_URL = process.env.NEXT_PUBLIC_PAYMASTER ||
  'https://api.developer.coinbase.com/rpc/v1/base/[REDACTED]';

/**
 * Query CDP bundler for userOperation receipt
 */
async function getUserOpReceipt(userOpHash: string) {
  try {
    const response = await fetch(BUNDLER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationReceipt',
        params: [userOpHash],
      }),
    });

    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.error(`❌ [Cron] Error querying bundler for ${userOpHash}:`, error);
    return null;
  }
}

/**
 * IMPROVED Cron job that queries CDP bundler for userOperation status
 *
 * CDP Paymaster transactions return a userOperationHash immediately, but the actual
 * blockchain transaction is created later by the bundler. This cron job:
 * 1. Fetches pending bounties
 * 2. Queries CDP bundler for each userOperationHash
 * 3. Extracts the real transaction hash and bounty ID
 * 4. Updates the database
 */
export async function GET(request: NextRequest) {
  try {
    const denied = requireCron(request);
    if (denied) return denied;

    console.log('🔄 [Cron V2] Starting pending bounties update (address-based matching)...');

    // Fetch all pending bounties
    const { data: pendingBounties, error: fetchError } = await supabase
      .from('bounties')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ [Cron] Error fetching pending bounties:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch pending bounties', details: fetchError.message },
        { status: 500 },
      );
    }

    if (!pendingBounties || pendingBounties.length === 0) {
      console.log('✅ [Cron] No pending bounties to process');
      return NextResponse.json({
        success: true,
        message: 'No pending bounties',
        processed: 0,
      });
    }

    console.log(`📋 [Cron] Found ${pendingBounties.length} pending bounties to check`);

    // Get recent BountyCreated events from blockchain
    const latestBlock = await publicClient.getBlockNumber();
    const startBlock = latestBlock - 1000n; // Last ~30 minutes

    console.log(`🔍 [Cron] Searching blocks ${startBlock} to ${latestBlock} for BountyCreated events...`);

    const logs = await publicClient.getLogs({
      address: BOUNTY_MANAGER_ADDRESS,
      event: {
        type: 'event',
        name: 'BountyCreated',
        inputs: [
          { type: 'uint256', name: 'bountyId', indexed: true },
          { type: 'address', name: 'creator', indexed: true },
          { type: 'uint128', name: 'value', indexed: false },
          { type: 'string', name: 'podId', indexed: false },
        ],
      },
      fromBlock: startBlock,
      toBlock: 'latest',
    });

    console.log(`📋 [Cron] Found ${logs.length} BountyCreated events in recent blocks`);

    const results = {
      confirmed: [] as string[],
      stillPending: [] as string[],
      failed: [] as string[],
    };

    // Match pending bounties with blockchain events
    for (const bounty of pendingBounties) {
      try {
        const bountyAge = (Date.now() - new Date(bounty.created_at).getTime()) / 1000 / 60;

        // Mark as failed if older than 10 minutes
        if (bountyAge > 10) {
          console.warn(`⚠️ [Cron] Bounty ${bounty.id} is ${bountyAge.toFixed(1)} minutes old, marking as failed`);

          await supabase
            .from('bounties')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', bounty.id);

          results.failed.push(bounty.id);
          continue;
        }

        // Find matching BountyCreated event by creator address
        const creatorAddress = bounty.creator_address?.toLowerCase();
        if (!creatorAddress) {
          console.warn(`⚠️ [Cron] Bounty ${bounty.id} has no creator_address`);
          results.stillPending.push(bounty.id);
          continue;
        }

        const matchingLog = logs.find((log) => {
          const logCreator = `0x${log.topics[2]?.slice(26)}`.toLowerCase();
          return logCreator === creatorAddress;
        });

        if (!matchingLog) {
          console.log(`⏳ [Cron] No matching transaction found yet for bounty ${bounty.id} (creator: ${creatorAddress})`);
          results.stillPending.push(bounty.id);
          continue;
        }

        // Extract bountyId from event
        const bountyIdHex = matchingLog.topics[1];
        const onchainBountyId = BigInt(bountyIdHex!).toString();

        console.log(`🎯 [Cron] Found matching transaction for bounty ${bounty.id}`);
        console.log(`   Transaction: ${matchingLog.transactionHash}`);
        console.log(`   On-chain ID: ${onchainBountyId}`);

        // Update database
        const { error: updateError } = await supabase
          .from('bounties')
          .update({
            blockchain_id: onchainBountyId,
            onchain_id: onchainBountyId,
            transaction_hash: matchingLog.transactionHash, // Update with real tx hash
            status: 'open',
            updated_at: new Date().toISOString(),
          })
          .eq('id', bounty.id);

        if (updateError) {
          console.error(`❌ [Cron] Error updating bounty ${bounty.id}:`, updateError);
          results.failed.push(bounty.id);
          continue;
        }

        console.log(`✅ [Cron] Bounty ${bounty.id} confirmed with on-chain ID ${onchainBountyId}`);
        results.confirmed.push(bounty.id);

      } catch (bountyError) {
        console.error(`❌ [Cron] Error processing bounty ${bounty.id}:`, bountyError);
        results.failed.push(bounty.id);
      }
    }

    console.log('📊 [Cron] Update complete:', {
      confirmed: results.confirmed.length,
      stillPending: results.stillPending.length,
      failed: results.failed.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Pending bounties update completed',
      results: {
        confirmed: results.confirmed.length,
        stillPending: results.stillPending.length,
        failed: results.failed.length,
        details: results,
      },
    });

  } catch (error: any) {
    console.error('❌ [Cron] Fatal error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

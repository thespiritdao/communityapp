import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, decodeEventLog } from 'viem';
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

// BountyCreated event signature
// event BountyCreated(uint256 indexed bountyId, address indexed creator, uint128 value, string podId)
const BOUNTY_CREATED_EVENT_ABI = {
  type: 'event',
  name: 'BountyCreated',
  inputs: [
    { type: 'uint256', name: 'bountyId', indexed: true },
    { type: 'address', name: 'creator', indexed: true },
    { type: 'uint128', name: 'value', indexed: false },
    { type: 'string', name: 'podId', indexed: false },
  ],
} as const;

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS) as `0x${string}`;

/**
 * Cron job to update pending bounties
 *
 * This runs every 5 minutes to check if pending bounty transactions have been confirmed.
 * When confirmed, it extracts the bountyId from the transaction logs and updates the database.
 *
 * Triggered by: Vercel Cron (see vercel.json)
 * Schedule: Every 5 minutes
 *
 * Security: Should be protected by Vercel cron secret header in production
 */
export async function GET(request: NextRequest) {
  try {
    const denied = requireCron(request);
    if (denied) return denied;

    console.log('🔄 [Cron] Starting pending bounties update...');

    // Fetch all pending bounties with transaction hashes
    const { data: pendingBounties, error: fetchError } = await supabase
      .from('bounties')
      .select('*')
      .eq('status', 'pending')
      .not('transaction_hash', 'is', null)
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

    const results = {
      confirmed: [] as string[],
      stillPending: [] as string[],
      failed: [] as string[],
    };

    // Process each pending bounty
    for (const bounty of pendingBounties) {
      try {
        const txHash = bounty.transaction_hash as `0x${string}`;

        console.log(`🔍 [Cron] Checking transaction ${txHash.slice(0, 10)}... for bounty ${bounty.id}`);

        // Fetch transaction receipt from Base network
        const receipt = await publicClient.getTransactionReceipt({
          hash: txHash,
        }).catch(() => null);

        if (!receipt) {
          // Transaction not found or still pending
          console.log(`⏳ [Cron] Transaction ${txHash.slice(0, 10)}... not yet mined`);
          results.stillPending.push(bounty.id);

          // Check if bounty is older than 10 minutes - mark as failed
          const createdAt = new Date(bounty.created_at);
          const ageMinutes = (Date.now() - createdAt.getTime()) / 1000 / 60;

          if (ageMinutes > 10) {
            console.warn(`⚠️ [Cron] Bounty ${bounty.id} is ${ageMinutes.toFixed(1)} minutes old, marking as failed`);

            await supabase
              .from('bounties')
              .update({
                status: 'failed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', bounty.id);

            results.failed.push(bounty.id);
          }

          continue;
        }

        // Check if transaction succeeded
        if (receipt.status !== 'success') {
          console.error(`❌ [Cron] Transaction ${txHash.slice(0, 10)}... failed on-chain`);

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

        // Transaction succeeded - extract bountyId from logs
        console.log(`✅ [Cron] Transaction ${txHash.slice(0, 10)}... confirmed! Parsing logs...`);

        // Find BountyCreated event in logs
        // BountyCreated(uint256,address,uint128,string) = 0x53902e1474335a04152927f2e2b4e98a09b6a6f269fbab584d6ec3b22176995c
        const BOUNTY_CREATED_TOPIC = '0x53902e1474335a04152927f2e2b4e98a09b6a6f269fbab584d6ec3b22176995c';

        const bountyCreatedLog = receipt.logs.find(
          (log) =>
            log.address?.toLowerCase() === BOUNTY_MANAGER_ADDRESS.toLowerCase() &&
            log.topics[0] === BOUNTY_CREATED_TOPIC
        );

        if (!bountyCreatedLog) {
          console.error(`❌ [Cron] No BountyCreated event found in transaction logs`);
          results.failed.push(bounty.id);
          continue;
        }

        // Decode the event to extract bountyId
        let onchainBountyId: string;

        try {
          // The bountyId is in topics[1] (first indexed parameter)
          const bountyIdHex = bountyCreatedLog.topics[1];
          onchainBountyId = BigInt(bountyIdHex!).toString();
          console.log(`🎯 [Cron] Extracted bountyId: ${onchainBountyId}`);
        } catch (decodeError) {
          console.error('❌ [Cron] Error decoding bountyId:', decodeError);
          results.failed.push(bounty.id);
          continue;
        }

        // Update bounty in database with confirmed status and bountyId
        const { error: updateError } = await supabase
          .from('bounties')
          .update({
            blockchain_id: onchainBountyId,
            onchain_id: onchainBountyId,
            status: 'open',
            updated_at: new Date().toISOString(),
          })
          .eq('id', bounty.id);

        if (updateError) {
          console.error(`❌ [Cron] Error updating bounty ${bounty.id}:`, updateError);
          results.failed.push(bounty.id);
          continue;
        }

        console.log(`✅ [Cron] Bounty ${bounty.id} confirmed and updated with onchain ID ${onchainBountyId}`);
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

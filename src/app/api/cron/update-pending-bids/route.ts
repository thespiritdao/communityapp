import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireCron } from '@/lib/cronAuth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS) as `0x${string}`;

// BidPlaced event signature:
// event BidPlaced(uint256 indexed bountyId, address indexed bidder, uint256 bidIndex)
const BID_PLACED_TOPIC = '0x8e1ec8b4766f6f8f6c0e6e2f4c3bc5e7a36e7a1b9f0c1e3d2a4b5c6d7e8f9a0b';

// CDP Bundler URL
const BUNDLER_URL = process.env.NEXT_PUBLIC_PAYMASTER ?? '';

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
    console.error(`❌ [Cron Bids] Error querying bundler for ${userOpHash}:`, error);
    return null;
  }
}

/**
 * Cron job to confirm pending bid submissions via CDP bundler API
 *
 * This job:
 * 1. Fetches bids with null onchain_bid_index (pending confirmation)
 * 2. Queries CDP bundler for each userOperationHash
 * 3. Extracts the real transaction hash and bid index from logs
 * 4. Updates the database with on-chain confirmation details
 */
export async function GET(request: NextRequest) {
  try {
    const denied = requireCron(request);
    if (denied) return denied;

    console.log('🔄 [Cron Bids] Starting pending bids update (bundler API)...');

    // Fetch bids with placement_tx_hash but no onchain_bid_index
    // These are bids that have been submitted but not yet confirmed
    const { data: pendingBids, error: fetchError } = await supabase
      .from('bids')
      .select('*')
      .not('placement_tx_hash', 'is', null)
      .is('onchain_bid_index', null)
      .order('submitted_at', { ascending: true });

    if (fetchError) {
      console.error('❌ [Cron Bids] Error fetching pending bids:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch pending bids', details: fetchError.message },
        { status: 500 },
      );
    }

    if (!pendingBids || pendingBids.length === 0) {
      console.log('✅ [Cron Bids] No pending bids to process');
      return NextResponse.json({
        success: true,
        message: 'No pending bids',
        processed: 0,
      });
    }

    console.log(`📋 [Cron Bids] Found ${pendingBids.length} pending bids to check`);

    const results = {
      confirmed: [] as string[],
      stillPending: [] as string[],
      failed: [] as string[],
    };

    // Process each pending bid
    for (const bid of pendingBids) {
      try {
        const bidAge = (Date.now() - new Date(bid.submitted_at).getTime()) / 1000 / 60;

        // Mark as failed if older than 10 minutes
        if (bidAge > 10) {
          console.warn(`⚠️ [Cron Bids] Bid ${bid.id} is ${bidAge.toFixed(1)} minutes old, marking as failed`);

          await supabase
            .from('bids')
            .update({
              status: 'legacy_pending', // Mark as failed confirmation
            })
            .eq('id', bid.id);

          results.failed.push(bid.id);
          continue;
        }

        // Query CDP bundler for userOperation status
        const userOpHash = bid.placement_tx_hash;
        console.log(`🔍 [Cron Bids] Querying bundler for userOp: ${userOpHash.slice(0, 10)}...`);

        const userOpReceipt = await getUserOpReceipt(userOpHash);

        if (!userOpReceipt) {
          console.log(`⏳ [Cron Bids] UserOp ${userOpHash.slice(0, 10)}... not yet processed`);
          results.stillPending.push(bid.id);
          continue;
        }

        // Check if userOp succeeded
        if (!userOpReceipt.success) {
          console.error(`❌ [Cron Bids] UserOp ${userOpHash.slice(0, 10)}... failed:`, userOpReceipt.reason);

          await supabase
            .from('bids')
            .update({
              status: 'legacy_pending', // Mark as failed confirmation
            })
            .eq('id', bid.id);

          results.failed.push(bid.id);
          continue;
        }

        // Extract transaction hash and bidIndex from logs
        const txHash = userOpReceipt.receipt.transactionHash;
        console.log(`✅ [Cron Bids] UserOp processed! Transaction: ${txHash}`);

        // Find BidPlaced event in logs
        // Event: BidPlaced(uint256 indexed bountyId, address indexed bidder, uint256 bidIndex)
        // bidIndex is NOT indexed, so it's in the data field
        const bidPlacedLog = userOpReceipt.logs.find(
          (log: any) =>
            log.address?.toLowerCase() === BOUNTY_MANAGER_ADDRESS.toLowerCase() &&
            log.topics &&
            log.topics.length >= 3 // bountyId (indexed) and bidder (indexed)
        );

        if (!bidPlacedLog) {
          console.error(`❌ [Cron Bids] No BidPlaced event found in transaction logs`);
          results.failed.push(bid.id);
          continue;
        }

        // Extract bidIndex from data field (not indexed)
        const bidIndex = parseInt(bidPlacedLog.data, 16);

        console.log(`🎯 [Cron Bids] Extracted bid index: ${bidIndex}`);

        // Update database with on-chain confirmation
        const { error: updateError } = await supabase
          .from('bids')
          .update({
            onchain_bid_index: bidIndex,
            placement_tx_hash: txHash, // Update with real tx hash
            status: 'pending', // Now pending review (not pending blockchain)
          })
          .eq('id', bid.id);

        if (updateError) {
          console.error(`❌ [Cron Bids] Error updating bid ${bid.id}:`, updateError);
          results.failed.push(bid.id);
          continue;
        }

        console.log(`✅ [Cron Bids] Bid ${bid.id} confirmed with on-chain index ${bidIndex}`);
        results.confirmed.push(bid.id);

      } catch (bidError) {
        console.error(`❌ [Cron Bids] Error processing bid ${bid.id}:`, bidError);
        results.failed.push(bid.id);
      }
    }

    console.log('📊 [Cron Bids] Update complete:', {
      confirmed: results.confirmed.length,
      stillPending: results.stillPending.length,
      failed: results.failed.length,
    });

    return NextResponse.json({
      success: true,
      message: 'Pending bids update completed',
      results: {
        confirmed: results.confirmed.length,
        stillPending: results.stillPending.length,
        failed: results.failed.length,
        details: results,
      },
    });

  } catch (error: any) {
    console.error('❌ [Cron Bids] Fatal error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 },
    );
  }
}

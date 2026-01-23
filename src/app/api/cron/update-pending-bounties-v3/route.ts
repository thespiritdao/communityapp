import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
  '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2') as `0x${string}`;

const BOUNTY_CREATED_TOPIC = '0xe6c97b2c674b721b612c95fcdc97bc070954ecd1851386053825e8bcfe7fd50d';

// CDP Bundler URL
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
 * V3 Cron job - Queries CDP bundler API for userOperation status
 *
 * This version directly queries the CDP bundler using eth_getUserOperationReceipt
 * to get the real transaction hash and extract the bounty ID from logs.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('❌ [Cron V3] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔄 [Cron V3] Starting pending bounties update (bundler API)...');

    // Fetch all pending bounties
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

        // Query CDP bundler for userOperation status
        const userOpHash = bounty.transaction_hash;
        console.log(`🔍 [Cron] Querying bundler for userOp: ${userOpHash.slice(0, 10)}...`);

        const userOpReceipt = await getUserOpReceipt(userOpHash);

        if (!userOpReceipt) {
          console.log(`⏳ [Cron] UserOp ${userOpHash.slice(0, 10)}... not yet processed`);
          results.stillPending.push(bounty.id);
          continue;
        }

        // Check if userOp succeeded
        if (!userOpReceipt.success) {
          console.error(`❌ [Cron] UserOp ${userOpHash.slice(0, 10)}... failed:`, userOpReceipt.reason);

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

        // Extract transaction hash and bountyId from logs
        const txHash = userOpReceipt.receipt.transactionHash;
        console.log(`✅ [Cron] UserOp processed! Transaction: ${txHash}`);

        // Find BountyCreated event in logs
        const bountyCreatedLog = userOpReceipt.logs.find(
          (log: any) =>
            log.address?.toLowerCase() === BOUNTY_MANAGER_ADDRESS.toLowerCase() &&
            log.topics[0] === BOUNTY_CREATED_TOPIC
        );

        if (!bountyCreatedLog) {
          console.error(`❌ [Cron] No BountyCreated event found in transaction logs`);
          results.failed.push(bounty.id);
          continue;
        }

        // Extract bountyId from topics[1] (first indexed parameter)
        const bountyIdHex = bountyCreatedLog.topics[1];
        const onchainBountyId = BigInt(bountyIdHex).toString();

        console.log(`🎯 [Cron] Extracted bounty ID: ${onchainBountyId}`);

        // Update database
        const { error: updateError } = await supabase
          .from('bounties')
          .update({
            blockchain_id: onchainBountyId,
            onchain_id: onchainBountyId,
            transaction_hash: txHash, // Update with real tx hash
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

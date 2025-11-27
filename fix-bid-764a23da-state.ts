/**
 * State Conflict Resolution Script
 *
 * Fixes bid 764a23da-b4a2-4fd8-8ba6-2b55a1a92e99 which is approved on-chain
 * but shows as "pending" in database.
 *
 * Run this script to sync the database with on-chain state.
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { resolveStateConflict } from './src/features/bounty/utils/stateSync';

const BID_ID = '764a23da-b4a2-4fd8-8ba6-2b55a1a92e99';

async function fixBidState() {
  console.log('🔧 Starting state conflict resolution...');
  console.log('Bid ID:', BID_ID);

  // Create public client for on-chain reads
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  });

  try {
    // Use the built-in conflict resolution
    const resolved = await resolveStateConflict(BID_ID, publicClient);

    if (resolved) {
      console.log('✅ State conflict resolved successfully!');
      console.log('Database should now show bid as "approved"');
    } else {
      console.error('❌ Failed to resolve state conflict');
    }
  } catch (error) {
    console.error('❌ Error during conflict resolution:', error);
  }
}

// Run the fix
fixBidState();

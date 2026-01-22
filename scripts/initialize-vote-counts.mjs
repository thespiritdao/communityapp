// Script to initialize vote counts for existing proposals
// Run this once to backfill the governance_proposal_votes table

import 'dotenv/config';
import { readFileSync } from 'fs';

console.log('🚀 Initializing vote counts for existing proposals...\n');

// Read RPC URL from .env file
const envFile = readFileSync('.env', 'utf-8');
const rpcUrlMatch = envFile.match(/NEXT_PUBLIC_RPC_URL=(.+)/);
const RPC_URL = rpcUrlMatch ? rpcUrlMatch[1].trim() : 'https://mainnet.base.org';

console.log(`🔗 Using RPC: ${RPC_URL.substring(0, 50)}...\n`);

// Helper function to make RPC calls with retry
async function rpcCall(method, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: 1,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      return data.result;
    } catch (error) {
      console.warn(`⚠️ Attempt ${i + 1}/${retries} failed:`, error.message);

      if (i === retries - 1) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

// Get current block
console.log('📊 Fetching current block number...');
const currentBlockHex = await rpcCall('eth_blockNumber', []);
const currentBlock = parseInt(currentBlockHex, 16);
console.log(`✅ Current block: ${currentBlock}\n`);

// Use smaller block range to avoid timeout (50k blocks = ~1.15 days)
const fromBlock = currentBlock - 50000;

console.log(`📡 Syncing votes from block ${fromBlock} to ${currentBlock}...`);
console.log(`   (Scanning ${currentBlock - fromBlock} blocks, approximately 1.15 days)\n`);

// Call the sync API
try {
  const response = await fetch('http://localhost:3000/api/governance/sync-votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromBlock: fromBlock.toString(),
      toBlock: currentBlock.toString(),
    }),
  });

  const result = await response.json();

  if (response.ok) {
    console.log('\n✅ Success:', result.message);
    if (result.blocksProcessed) {
      console.log(`   Processed ${result.blocksProcessed} blocks`);
    }
  } else {
    console.error('\n❌ API Error:', result.error);
    console.error('\n💡 Tip: Make sure your dev server is running (npm run dev)');
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Failed to call sync API:', error.message);
  console.error('\n💡 Tip: Make sure your dev server is running on http://localhost:3000');
  process.exit(1);
}

console.log('\n✨ Vote counts initialized successfully!');
console.log('💡 The database will now be used for vote tallies instead of blockchain queries.');

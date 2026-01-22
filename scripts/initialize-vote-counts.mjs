// Script to initialize vote counts for existing proposals
// Run this once to backfill the governance_proposal_votes table

import 'dotenv/config';

console.log('🚀 Initializing vote counts for existing proposals...\n');

// Call the sync API to backfill all historical votes
const currentBlock = await fetch('https://mainnet.base.org', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    id: 1,
  }),
})
  .then(res => res.json())
  .then(data => parseInt(data.result, 16));

const fromBlock = currentBlock - 100000; // Last ~2.3 days

console.log(`📡 Syncing votes from block ${fromBlock} to ${currentBlock}...\n`);

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
  console.log('✅ Success:', result.message);
} else {
  console.error('❌ Error:', result.error);
  process.exit(1);
}

console.log('\n✨ Vote counts initialized successfully!');
console.log('💡 The database will now be used for vote tallies instead of blockchain queries.');

#!/usr/bin/env node
/**
 * Utility Script: Update Pending Proposals
 *
 * This script checks all proposals with temp_ IDs in the database
 * and attempts to update them with their real on-chain proposal IDs.
 *
 * Usage:
 *   node scripts/update-pending-proposals.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, parseAbiItem, parseEventLogs } from 'viem';
import { base } from 'viem/chains';
import 'dotenv/config';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Base public client
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

async function updatePendingProposals() {
  console.log('🔍 Checking for pending proposals with temp_ IDs...\n');

  // Get all pending proposals
  const { data: pendingProposals, error } = await supabase
    .from('proposal_metadata')
    .select('*')
    .like('onchain_proposal_id', 'temp_%');

  if (error) {
    console.error('❌ Error fetching pending proposals:', error);
    process.exit(1);
  }

  if (!pendingProposals || pendingProposals.length === 0) {
    console.log('✅ No pending proposals found - all proposals are confirmed!');
    return;
  }

  console.log(`📋 Found ${pendingProposals.length} pending proposal(s)\n`);

  // IMPORTANT: UserOperationHash ≠ Transaction Hash in ERC-4337
  // We need to query on-chain events directly instead of looking up by hash
  console.log('🔍 Querying blockchain for recent ProposalCreated events...\n');

  const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR;
  if (!GOVERNOR_ADDRESS) {
    console.error('❌ Missing NEXT_PUBLIC_DAO_GOVERNOR environment variable');
    process.exit(1);
  }

  // Get current block number
  const currentBlock = await publicClient.getBlockNumber();
  // Look back 10,000 blocks (~33 hours on Base)
  const fromBlock = currentBlock - 10000n;

  console.log(`   Current Block: ${currentBlock}`);
  console.log(`   Searching from Block: ${fromBlock}\n`);

  // Query all ProposalCreated events
  const proposalCreatedAbi = parseAbiItem(
    'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)',
  );

  const logs = await publicClient.getLogs({
    address: GOVERNOR_ADDRESS,
    event: proposalCreatedAbi,
    fromBlock,
    toBlock: 'latest',
  });

  console.log(`📋 Found ${logs.length} ProposalCreated events on-chain\n`);

  // Parse all events
  const onChainProposals = logs.map((log) => {
    const parsed = parseEventLogs({
      abi: [proposalCreatedAbi],
      logs: [log],
    })[0];

    return {
      proposalId: parsed.args.proposalId?.toString(),
      proposer: parsed.args.proposer?.toLowerCase(),
      description: parsed.args.description,
      transactionHash: log.transactionHash,
      blockNumber: log.blockNumber,
    };
  });

  let updated = 0;
  let failed = 0;
  let stillPending = 0;

  for (const proposal of pendingProposals) {
    const tempId = proposal.onchain_proposal_id;

    console.log(`\n📝 Proposal: "${proposal.title}"`);
    console.log(`   Temp ID: ${tempId}`);
    console.log(`   Proposer: ${proposal.proposer_address}`);

    // Build expected description (title + body format)
    const expectedDescription = `# ${proposal.title}\n\n${proposal.description}`;

    // Try to find matching on-chain proposal
    const match = onChainProposals.find((onChain) => {
      const proposerMatch = onChain.proposer === proposal.proposer_address?.toLowerCase();
      const descriptionMatch = onChain.description === expectedDescription;
      return proposerMatch && descriptionMatch;
    });

    if (match) {
      console.log(`   ✅ Found on-chain! Proposal ID: ${match.proposalId}`);
      console.log(`   📍 Block: ${match.blockNumber}`);
      console.log(`   🔗 Tx Hash: ${match.transactionHash}`);

      // Update database
      const { error: updateError } = await supabase
        .from('proposal_metadata')
        .update({
          onchain_proposal_id: match.proposalId,
          transaction_hash: match.transactionHash,
        })
        .eq('id', proposal.id);

      if (updateError) {
        console.log('   ❌ Database update failed:', updateError.message);
        failed++;
      } else {
        console.log(`   ✅ Updated: ${tempId} → ${match.proposalId}`);
        updated++;
      }
    } else {
      console.log('   ⏳ Not found on-chain yet - still pending confirmation');
      console.log(`   💡 Expected description format: "# ${proposal.title}\\n\\n${proposal.description?.substring(0, 50)}..."`);
      stillPending++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully updated: ${updated}`);
  console.log(`⏳ Still pending: ${stillPending}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${pendingProposals.length}`);
  console.log('='.repeat(60) + '\n');

  if (stillPending > 0) {
    console.log('💡 Tip: Run this script again later to check pending transactions');
  }

  if (updated > 0) {
    console.log('🎉 Success! Proposals have been updated with their on-chain IDs');
  }
}

// Run the script
updatePendingProposals().catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

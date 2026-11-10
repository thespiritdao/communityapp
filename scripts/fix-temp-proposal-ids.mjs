/**
 * fix-temp-proposal-ids.mjs
 *
 * Resolves stuck temp_ proposal IDs in proposal_metadata by:
 * 1. Fetching all rows where onchain_proposal_id starts with 'temp_'
 * 2. Looking up the transaction receipt for each
 * 3. Parsing the ProposalCreated event to extract the real proposal ID
 * 4. Updating proposal_metadata (and pod_level_proposals if present)
 *
 * Usage: node scripts/fix-temp-proposal-ids.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http, decodeEventLog } from 'viem';
import { base } from 'viem/chains';

// Credentials come from the environment (see .env.example). Never hardcode them here.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RPC_URL) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_RPC_URL first.');
  process.exit(1);
}

const PROPOSAL_CREATED_ABI = [
  {
    name: 'ProposalCreated',
    type: 'event',
    inputs: [
      { name: 'proposalId', type: 'uint256', indexed: false },
      { name: 'proposer', type: 'address', indexed: false },
      { name: 'targets', type: 'address[]', indexed: false },
      { name: 'values', type: 'uint256[]', indexed: false },
      { name: 'signatures', type: 'string[]', indexed: false },
      { name: 'calldatas', type: 'bytes[]', indexed: false },
      { name: 'startBlock', type: 'uint256', indexed: false },
      { name: 'endBlock', type: 'uint256', indexed: false },
      { name: 'description', type: 'string', indexed: false },
    ],
  },
];

// ProposalCreated event topic0 (keccak256 of the signature)
const PROPOSAL_CREATED_TOPIC = '0x7d84a6263ae0d98d3329bd7b46bb4e8d6f98cd35a7adb45c274c8b7fd5ebd5e0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

async function main() {
  // 1. Fetch all stuck temp_ rows
  const { data: rows, error } = await supabase
    .from('proposal_metadata')
    .select('id, onchain_proposal_id, title, transaction_hash')
    .like('onchain_proposal_id', 'temp_%');

  if (error) {
    console.error('Failed to fetch rows:', error.message);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log('No stuck temp_ proposals found. Nothing to do.');
    return;
  }

  console.log(`Found ${rows.length} stuck proposal(s):\n`);

  for (const row of rows) {
    console.log(`Processing: "${row.title}" (${row.onchain_proposal_id})`);

    if (!row.transaction_hash) {
      console.log(`  SKIP — no transaction_hash recorded\n`);
      continue;
    }

    console.log(`  tx: ${row.transaction_hash}`);

    let receipt;
    try {
      receipt = await publicClient.getTransactionReceipt({
        hash: row.transaction_hash,
      });
    } catch (err) {
      console.error(`  FAILED to fetch receipt: ${err.message}\n`);
      continue;
    }

    if (!receipt) {
      console.log(`  SKIP — receipt not found (tx may still be pending)\n`);
      continue;
    }

    if (receipt.status !== 'success') {
      console.log(`  SKIP — tx status: ${receipt.status} (transaction failed on-chain)\n`);
      continue;
    }

    // Parse ProposalCreated event from receipt logs
    let realProposalId = null;

    for (const log of receipt.logs) {
      if (log.topics[0]?.toLowerCase() !== PROPOSAL_CREATED_TOPIC) continue;
      try {
        const decoded = decodeEventLog({
          abi: PROPOSAL_CREATED_ABI,
          data: log.data,
          topics: log.topics,
          eventName: 'ProposalCreated',
        });
        realProposalId = decoded.args.proposalId.toString();
        break;
      } catch {
        // not this log
      }
    }

    if (!realProposalId) {
      console.log(`  SKIP — could not find ProposalCreated event in receipt logs\n`);
      continue;
    }

    console.log(`  Real proposal ID: ${realProposalId}`);

    // Update proposal_metadata
    const { error: metaError } = await supabase
      .from('proposal_metadata')
      .update({ onchain_proposal_id: realProposalId })
      .eq('id', row.id);

    if (metaError) {
      console.error(`  FAILED to update proposal_metadata: ${metaError.message}\n`);
      continue;
    }

    console.log(`  Updated proposal_metadata`);

    // Also update pod_level_proposals if a matching row exists
    const { error: podError, count } = await supabase
      .from('pod_level_proposals')
      .update({ onchain_proposal_id: realProposalId })
      .eq('onchain_proposal_id', row.onchain_proposal_id)
      .select('id', { count: 'exact', head: true });

    if (podError) {
      console.log(`  pod_level_proposals: no matching row (ok for DAO-wide proposals)`);
    } else if (count && count > 0) {
      console.log(`  Updated pod_level_proposals`);
    }

    console.log(`  Done\n`);
  }

  console.log('All done.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

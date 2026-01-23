import { createClient } from '@supabase/supabase-js';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
  '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2').toLowerCase();

const BOUNTY_CREATED_TOPIC = '0x53902e1474335a04152927f2e2b4e98a09b6a6f269fbab584d6ec3b22176995c';

async function fixBounty(bountyId) {
  console.log(`\n🔧 Fixing bounty ${bountyId}...`);

  // Fetch bounty
  const { data: bounty, error: fetchError } = await supabase
    .from('bounties')
    .select('*')
    .eq('id', bountyId)
    .single();

  if (fetchError || !bounty) {
    console.error('❌ Error fetching bounty:', fetchError);
    return;
  }

  console.log(`📋 Bounty: ${bounty.title}`);
  console.log(`📝 Status: ${bounty.status}`);
  console.log(`🔗 Transaction: ${bounty.transaction_hash}`);

  if (!bounty.transaction_hash) {
    console.error('❌ No transaction hash found');
    return;
  }

  // Fetch transaction receipt
  console.log('🔍 Fetching transaction receipt from Base...');

  // Try getting receipt directly first
  let receipt = await publicClient.getTransactionReceipt({
    hash: bounty.transaction_hash,
  }).catch(err => null);

  // If not found, this might be a userOperationHash - try to find the actual transaction
  if (!receipt) {
    console.log('⚠️ Direct receipt not found - may be a userOperationHash');
    console.log('🔍 Searching for transaction by block range...');

    // Get recent blocks and search for transactions from creator
    try {
      const latestBlock = await publicClient.getBlockNumber();
      const startBlock = latestBlock - 1000n; // Search last 1000 blocks (~30 minutes)

      console.log(`🔍 Searching blocks ${startBlock} to ${latestBlock}...`);

      // Get transactions to BountyManager from this address
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

      console.log(`📋 Found ${logs.length} BountyCreated events in recent blocks`);

      // Find log matching our creator and approximate time
      const bountyCreatedTime = new Date(bounty.created_at).getTime();

      for (const log of logs.reverse()) { // Start from most recent
        if (log.topics[2]?.toLowerCase().includes(bounty.creator_address.toLowerCase().slice(2))) {
          console.log(`🎯 Found matching creator in tx: ${log.transactionHash}`);
          receipt = await publicClient.getTransactionReceipt({
            hash: log.transactionHash,
          });
          break;
        }
      }
    } catch (searchError) {
      console.error('❌ Error searching for transaction:', searchError.message);
    }
  }

  if (!receipt) {
    console.error('❌ Transaction not found or not confirmed yet');
    return;
  }

  if (receipt.status !== 'success') {
    console.error('❌ Transaction failed on-chain');
    return;
  }

  console.log('✅ Transaction confirmed on-chain');

  // Find BountyCreated event
  const bountyCreatedLog = receipt.logs.find(
    (log) =>
      log.address?.toLowerCase() === BOUNTY_MANAGER_ADDRESS &&
      log.topics[0] === BOUNTY_CREATED_TOPIC
  );

  if (!bountyCreatedLog) {
    console.error('❌ No BountyCreated event found in transaction logs');
    console.log('Available logs:', receipt.logs.map(log => ({
      address: log.address,
      topic0: log.topics[0]
    })));
    return;
  }

  // Extract bountyId from topics[1]
  const bountyIdHex = bountyCreatedLog.topics[1];
  const onchainBountyId = BigInt(bountyIdHex).toString();

  console.log(`🎯 Extracted on-chain bounty ID: ${onchainBountyId}`);

  // Update database
  const { error: updateError } = await supabase
    .from('bounties')
    .update({
      blockchain_id: onchainBountyId,
      onchain_id: onchainBountyId,
      status: 'open',
      updated_at: new Date().toISOString(),
    })
    .eq('id', bountyId);

  if (updateError) {
    console.error('❌ Error updating bounty:', updateError);
    return;
  }

  console.log('✅ Bounty updated successfully!');
  console.log(`✅ On-chain ID: ${onchainBountyId}`);
  console.log(`✅ Status: open`);
}

// Run the fix
// const bountyId = '25cb6c3f-0fb9-473c-a014-b1f8ce65af43';

// Or check a specific transaction directly
async function checkTransaction(txHash) {
  console.log(`\n🔍 Checking transaction: ${txHash}`);

  const receipt = await publicClient.getTransactionReceipt({
    hash: txHash,
  }).catch(err => {
    console.error('❌ Error:', err.shortMessage || err.message);
    return null;
  });

  if (!receipt) {
    console.log('❌ Transaction not found');
    return;
  }

  console.log('✅ Transaction found!');
  console.log(`📝 Status: ${receipt.status}`);
  console.log(`📦 Block: ${receipt.blockNumber}`);
  console.log(`🔗 From: ${receipt.from}`);
  console.log(`🎯 To: ${receipt.to}`);
  console.log(`📋 Logs: ${receipt.logs.length}`);

  // Find BountyCreated event
  const bountyCreatedLog = receipt.logs.find(
    (log) =>
      log.address?.toLowerCase() === BOUNTY_MANAGER_ADDRESS &&
      log.topics[0] === BOUNTY_CREATED_TOPIC
  );

  if (bountyCreatedLog) {
    const bountyIdHex = bountyCreatedLog.topics[1];
    const onchainBountyId = BigInt(bountyIdHex).toString();
    console.log(`🎯 Bounty ID: ${onchainBountyId}`);
  } else {
    console.log('⚠️ No BountyCreated event found');
  }
}

// Check the latest bounty transaction
checkTransaction('0xdbf22a85f2f52a9995d4883d91d06ddebf198801c88289bd822bcbfabf6c9cad')
  .then(() => {
    console.log('\n✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });

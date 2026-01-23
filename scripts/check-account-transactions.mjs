import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

const SMART_ACCOUNT_ADDRESS = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48';

async function checkTransactions() {
  console.log(`\n🔍 Checking transactions FROM this Smart Account...`);
  console.log(`📍 Address: ${SMART_ACCOUNT_ADDRESS}\n`);

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const startBlock = latestBlock - 10000n; // Last ~5 hours

    console.log(`🔍 Searching blocks ${startBlock} to ${latestBlock}...`);

    // Get all transactions FROM this address
    const block = await publicClient.getBlock({ blockNumber: latestBlock });

    // Unfortunately viem doesn't have a direct "get transactions by sender" method
    // We need to scan blocks or use an indexer
    // Let's check recent blocks for any transactions from this address

    console.log('⚠️  Note: Viem requires block-by-block scanning or an indexer API');
    console.log('   Recommendation: Check on BaseScan directly:');
    console.log(`   https://basescan.org/address/${SMART_ACCOUNT_ADDRESS}#internaltx\n`);

    // Alternative: Check if this address has interacted with BountyManager
    const BOUNTY_MANAGER = '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2';

    const logs = await publicClient.getLogs({
      address: BOUNTY_MANAGER,
      fromBlock: startBlock,
      toBlock: 'latest',
    });

    console.log(`📋 Total BountyManager events in period: ${logs.length}`);

    // Check for events involving this address
    const relevantLogs = logs.filter(log => {
      const topics = log.topics.map(t => t?.toLowerCase());
      const addressHex = SMART_ACCOUNT_ADDRESS.toLowerCase().slice(2);
      return topics.some(t => t?.includes(addressHex));
    });

    console.log(`🎯 Events involving ${SMART_ACCOUNT_ADDRESS}: ${relevantLogs.length}`);

    if (relevantLogs.length > 0) {
      console.log('\n📝 Found events:');
      for (const log of relevantLogs) {
        console.log(`   - Tx: ${log.transactionHash}`);
        console.log(`     Block: ${log.blockNumber}`);
        console.log(`     Topics: ${log.topics.length}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkTransactions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

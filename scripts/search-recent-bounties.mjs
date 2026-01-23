import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

const BOUNTY_MANAGER_ADDRESS = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
  '0xF80c7e4c2309F8f9de3535138De8Dd8C0876c5E2');

async function searchRecentBounties() {
  console.log(`\n🔍 Searching for recent BountyCreated events...`);
  console.log(`📍 Contract: ${BOUNTY_MANAGER_ADDRESS}`);

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const startBlock = latestBlock - 10000n; // Last ~5 hours (longer search)

    console.log(`🔍 Searching blocks ${startBlock} to ${latestBlock}...`);

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

    console.log(`\n📋 Found ${logs.length} bounties created recently:\n`);

    for (const log of logs) {
      const bountyIdHex = log.topics[1];
      const bountyId = BigInt(bountyIdHex).toString();
      const creatorHex = log.topics[2];
      const creator = `0x${creatorHex.slice(26)}`;

      const block = await publicClient.getBlock({ blockNumber: log.blockNumber });
      const timestamp = new Date(Number(block.timestamp) * 1000);

      console.log(`🎯 Bounty ID: ${bountyId}`);
      console.log(`   Creator: ${creator}`);
      console.log(`   Tx Hash: ${log.transactionHash}`);
      console.log(`   Block: ${log.blockNumber}`);
      console.log(`   Time: ${timestamp.toISOString()}`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

searchRecentBounties()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

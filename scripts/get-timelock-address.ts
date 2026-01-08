/**
 * Get Timelock address from current Governor
 */

import dotenv from 'dotenv';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const GOVERNOR_ABI = parseAbi([
  'function timelock() external view returns (address)',
]);

async function main() {
  console.log('🔍 Getting Timelock address from Governor...\n');
  console.log(`Governor: ${GOVERNOR_ADDRESS}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  try {
    const timelockAddress = await publicClient.readContract({
      address: GOVERNOR_ADDRESS,
      abi: GOVERNOR_ABI,
      functionName: 'timelock',
    });

    console.log('✅ Timelock Address:', timelockAddress);
    console.log('\nUse this address when deploying the new Governor.');

  } catch (error) {
    console.error('❌ Error reading Timelock:', error);
  }
}

main()
  .then(() => {
    console.log('\n✅ Complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

/**
 * Check Governor configuration - what voting token does it use?
 */

import dotenv from 'dotenv';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const CURRENT_ADVOCATE = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const GOVERNOR_ABI = parseAbi([
  'function token() external view returns (address)',
  'function name() external view returns (string)',
  'function votingDelay() external view returns (uint256)',
  'function votingPeriod() external view returns (uint256)',
  'function proposalThreshold() external view returns (uint256)',
]);

async function main() {
  console.log('🏛️  Governor Configuration Check\n');
  console.log(`Governor: ${GOVERNOR_ADDRESS}`);
  console.log(`Current Advocate in .env: ${CURRENT_ADVOCATE}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  try {
    const [tokenAddress, name, votingDelay, votingPeriod, proposalThreshold] = await Promise.all([
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'token',
      }),
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'name',
      }),
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'votingDelay',
      }),
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'votingPeriod',
      }),
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: GOVERNOR_ABI,
        functionName: 'proposalThreshold',
      }),
    ]);

    console.log('📊 Governor Details:');
    console.log(`   Name: ${name}`);
    console.log(`   Voting Token: ${tokenAddress}`);
    console.log(`   Voting Delay: ${votingDelay} blocks`);
    console.log(`   Voting Period: ${votingPeriod} blocks`);
    console.log(`   Proposal Threshold: ${proposalThreshold}\n`);

    // Check if token matches
    if (tokenAddress.toLowerCase() === CURRENT_ADVOCATE.toLowerCase()) {
      console.log('✅ Governor is using the CURRENT Advocate address from .env');
      console.log('   Safe to redeploy Advocate (just update .env and database)');
    } else {
      console.log('⚠️  Governor is using a DIFFERENT token address!');
      console.log(`   Governor token: ${tokenAddress}`);
      console.log(`   .env Advocate:  ${CURRENT_ADVOCATE}`);
      console.log('\n🚨 CRITICAL: If you redeploy Advocate, you must also redeploy Governor!');
    }

  } catch (error) {
    console.error('❌ Error reading Governor:', error);
    console.error('\nThe Governor contract may not be deployed or may use a different ABI.');
  }
}

main()
  .then(() => {
    console.log('\n✅ Check complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

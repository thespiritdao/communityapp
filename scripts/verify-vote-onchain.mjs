/**
 * Script: Verify Vote Recorded On-Chain
 *
 * Usage:
 *   node scripts/verify-vote-onchain.mjs <proposal-uuid> <voter-address>
 *
 * Example:
 *   node scripts/verify-vote-onchain.mjs 480a9f2a-1cfa-4ffb-bf99-5ebf95e2d089 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const POD_GOV_ADDRESS = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const GOV_ABI = parseAbi([
  'function hasVoted(bytes32 proposalId, address voter) view returns (bool)',
]);

// Convert UUID to bytes32
const uuidToBytes32 = (uuid) => {
  const hex = uuid.replace(/-/g, '');
  return `0x${hex.padEnd(64, '0')}`;
};

async function main() {
  const proposalUUID = process.argv[2];
  const voterAddress = process.argv[3];

  if (!proposalUUID || !voterAddress) {
    console.error('❌ Error: Missing arguments');
    console.error('\nUsage: node scripts/verify-vote-onchain.mjs <proposal-uuid> <voter-address>');
    console.error('Example: node scripts/verify-vote-onchain.mjs 480a9f2a-1cfa-4ffb-bf99-5ebf95e2d089 0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48\n');
    process.exit(1);
  }

  console.log('🔍 Verifying Vote On-Chain\n');
  console.log('==========================================\n');
  console.log('Contract:  ', POD_GOV_ADDRESS);
  console.log('Proposal:  ', proposalUUID);
  console.log('Voter:     ', voterAddress);
  console.log('');

  const client = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const proposalId = uuidToBytes32(proposalUUID);
  console.log('Bytes32:   ', proposalId);
  console.log('');

  try {
    const hasVoted = await client.readContract({
      address: POD_GOV_ADDRESS,
      abi: GOV_ABI,
      functionName: 'hasVoted',
      args: [proposalId, voterAddress],
    });

    console.log('Has Voted: ', hasVoted ? '✅ YES' : '❌ NO');
    console.log('');

    if (hasVoted) {
      console.log('✅ SUCCESS! Vote is recorded on-chain.\n');
      console.log('View on BaseScan:');
      console.log(`https://basescan.org/address/${POD_GOV_ADDRESS}#events\n`);
    } else {
      console.log('❌ Vote NOT found on-chain.\n');
      console.log('Possible reasons:');
      console.log('  1. Vote was only saved to database (on-chain failed)');
      console.log('  2. Transaction is still pending');
      console.log('  3. Wrong proposal UUID or voter address\n');
    }
  } catch (error) {
    console.error('❌ Error querying contract:', error.message);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

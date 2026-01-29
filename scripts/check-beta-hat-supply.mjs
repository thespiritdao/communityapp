/**
 * Check Beta Tester Hat Supply
 */

import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

const HATS_PROTOCOL = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const HATS_ABI = parseAbi([
  'function getHatMaxSupply(uint256 hatId) external view returns (uint32)',
  'function hatSupply(uint256 hatId) external view returns (uint32)',
  'function isActive(uint256 hatId) external view returns (bool)',
]);

async function main() {
  console.log('🎩 Checking Beta Tester Hat Supply\n');

  if (!BETA_TESTER_HAT) {
    console.error('❌ NEXT_PUBLIC_BETA_TESTER_HAT not set in .env');
    return;
  }

  console.log('Hat ID:', BETA_TESTER_HAT);
  console.log('Hats Protocol:', HATS_PROTOCOL);
  console.log('');

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  try {
    // Check max supply
    const maxSupply = await publicClient.readContract({
      address: HATS_PROTOCOL,
      abi: HATS_ABI,
      functionName: 'getHatMaxSupply',
      args: [BigInt(BETA_TESTER_HAT)],
    });

    // Check current supply
    const currentSupply = await publicClient.readContract({
      address: HATS_PROTOCOL,
      abi: HATS_ABI,
      functionName: 'hatSupply',
      args: [BigInt(BETA_TESTER_HAT)],
    });

    // Check if active
    const isActive = await publicClient.readContract({
      address: HATS_PROTOCOL,
      abi: HATS_ABI,
      functionName: 'isActive',
      args: [BigInt(BETA_TESTER_HAT)],
    });

    console.log('📊 Hat Status:');
    console.log('  Max Supply:', maxSupply);
    console.log('  Current Supply:', currentSupply);
    console.log('  Is Active:', isActive);
    console.log('  Remaining:', maxSupply - currentSupply);
    console.log('');

    if (currentSupply >= maxSupply) {
      console.log('⚠️ WARNING: Hat supply limit reached!');
      console.log('   No more Beta Tester hats can be minted.');
    } else {
      console.log('✅ Hat supply OK:', `${maxSupply - currentSupply} hats remaining`);
    }

    if (!isActive) {
      console.log('❌ WARNING: Hat is NOT ACTIVE!');
      console.log('   Hat cannot be minted until reactivated.');
    }

  } catch (error) {
    console.error('❌ Error checking hat supply:', error);
  }
}

main().catch(console.error);

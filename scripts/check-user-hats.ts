// scripts/check-user-hats.ts
// Check what HATs a user currently has

import { config } from 'dotenv';
import { createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import * as path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const USER_ADDRESS = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';
const HATS_CONTRACT = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';

// HAT IDs from your environment
const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT;
const EXEC_POD_LEADER = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
const EXEC_POD_MEMBER = process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER;

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

const HATS_ABI = parseAbi([
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
  'function isWearerOfHat(address wearer, uint256 hatId) external view returns (bool)',
]);

async function checkHat(hatId: string | undefined, hatName: string) {
  if (!hatId) {
    console.log(`   ${hatName}: NOT CONFIGURED`);
    return;
  }

  try {
    const balance = await publicClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [USER_ADDRESS as `0x${string}`, BigInt(hatId)],
    });

    const isWearer = await publicClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [USER_ADDRESS as `0x${string}`, BigInt(hatId)],
    });

    console.log(`   ${hatName}:`);
    console.log(`     Balance: ${balance.toString()}`);
    console.log(`     Is Wearer: ${isWearer ? '✅ YES' : '❌ NO'}`);
    console.log(`     HAT ID: ${hatId}`);
  } catch (error: any) {
    console.log(`   ${hatName}: ERROR - ${error.message}`);
  }
}

async function main() {
  console.log('🎩 Checking HATs for User');
  console.log('==========================');
  console.log('User:', USER_ADDRESS);
  console.log('');

  await checkHat(BETA_TESTER_HAT, 'Beta Tester HAT');
  console.log('');
  await checkHat(EXEC_POD_LEADER, 'Exec Pod Leader HAT');
  console.log('');
  await checkHat(EXEC_POD_MEMBER, 'Exec Pod Member HAT');
  console.log('');

  console.log('Summary:');
  console.log('--------');
  console.log('If user has Exec Pod HAT but NOT Beta Tester HAT,');
  console.log('they cannot access pod management.');
  console.log('');
  console.log('Solution: User needs either:');
  console.log('1. Beta Tester HAT to be minted, OR');
  console.log('2. Pod management access control updated to not require Beta Tester HAT');
}

main().catch(console.error);

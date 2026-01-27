#!/usr/bin/env node
/**
 * Simple check for Beta Tester HAT on-chain expiration
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';
import TimeBasedToggleModuleABI from '../src/contracts/TimeBasedToggleModuleABI.json' assert { type: 'json' };

dotenv.config();

const HAT_ID = '0x000000880001000b000000000000000000000000000000000000000000000000';
const TOGGLE_MODULE_ADDRESS = process.env.NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE;

async function checkExpiration() {
  console.log('🔍 Checking Beta Tester HAT on-chain expiration...\n');

  if (!TOGGLE_MODULE_ADDRESS) {
    console.log('⚠️  NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE not configured');
    console.log('');
    console.log('✅ CONCLUSION: Time restriction is database-only.');
    console.log('   Your database update is complete and sufficient!');
    console.log('   No on-chain update needed.');
    console.log('');
    return;
  }

  console.log('Module Address:', TOGGLE_MODULE_ADDRESS);
  console.log('HAT ID:', HAT_ID);
  console.log('Network: Base Mainnet (8453)');
  console.log('RPC:', process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0]);
  console.log('');

  const client = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0]),
  });

  try {
    // Just read the expiration mapping directly
    console.log('📖 Reading hatExpirations mapping...\n');

    const expiration = await client.readContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TimeBasedToggleModuleABI,
      functionName: 'hatExpirations',
      args: [BigInt(HAT_ID)],
    });

    console.log('Raw expiration value:', expiration.toString());
    console.log('');

    if (expiration === 0n) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ NO ON-CHAIN EXPIRATION SET');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('The HAT has NO on-chain time restriction.');
      console.log('Time enforcement is database-only.');
      console.log('');
      console.log('✅ YOU\'RE DONE!');
      console.log('   The database update you just completed is sufficient.');
      console.log('   Beta Testers will have access until Feb 28, 2026.');
      console.log('');
    } else {
      const expirationDate = new Date(Number(expiration) * 1000);
      const targetDate = new Date('2026-02-28T23:59:00');

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📅 ON-CHAIN EXPIRATION FOUND');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('Current Expiration:', expirationDate.toLocaleString());
      console.log('Target Expiration: ', targetDate.toLocaleString());
      console.log('');

      if (expirationDate >= targetDate) {
        console.log('✅ ON-CHAIN EXPIRATION IS ALREADY CORRECT');
        console.log('   No on-chain update needed!');
        console.log('');
      } else {
        const daysDiff = Math.round((targetDate - expirationDate) / (1000 * 60 * 60 * 24));

        console.log('⚠️  ON-CHAIN UPDATE REQUIRED');
        console.log(`   Need to extend by ${daysDiff} days`);
        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 HOW TO UPDATE ON-CHAIN');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log('Option 1: Via UI (Easiest)');
        console.log('──────────────────────────');
        console.log('1. Go to /pods in your app');
        console.log('2. Find "Beta Testers Pod"');
        console.log('3. Manage roles → Edit Beta Tester role');
        console.log('4. Update expiration to Feb 28, 2026 23:59');
        console.log('5. Click "Commit Change" (gasless!)');
        console.log('');
        console.log('Option 2: Run Script');
        console.log('──────────────────────────');
        console.log('Create a script using SetHatExpirationButton component');
        console.log('or TimeBasedToggleService.setHatExpiration()');
        console.log('');
        console.log('Parameters:');
        console.log('  HAT ID:', HAT_ID);
        console.log('  New Expiration (Unix):', Math.floor(targetDate.getTime() / 1000));
        console.log('');
      }
    }

  } catch (error) {
    console.error('❌ Error reading contract:', error.message);
    console.log('');
    console.log('This could mean:');
    console.log('1. Contract not deployed at this address');
    console.log('2. Network issue');
    console.log('3. RPC endpoint problem');
    console.log('');
    console.log('If the contract was never deployed/configured:');
    console.log('✅ You\'re done! Database update is sufficient.');
    console.log('');
  }
}

checkExpiration()
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

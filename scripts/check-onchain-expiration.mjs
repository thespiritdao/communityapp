#!/usr/bin/env node
/**
 * Check if Beta Tester HAT has on-chain time restriction
 *
 * Usage: node scripts/check-onchain-expiration.mjs
 */

import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config();

// TimeBasedToggleModule ABI (just the functions we need)
const TIME_BASED_ABI = [
  {
    inputs: [{ name: 'hatId', type: 'uint256' }],
    name: 'getHatTimeWindow',
    outputs: [
      { name: 'startTime', type: 'uint256' },
      { name: 'expiration', type: 'uint256' },
      { name: 'isActive', type: 'boolean' },
      { name: 'timeUntilExpiration', type: 'uint256' }
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'hatId', type: 'uint256' }],
    name: 'getHatStatus',
    outputs: [{ name: '', type: 'boolean' }],
    stateMutability: 'view',
    type: 'function',
  },
];

const HAT_ID = '0x000000880001000b000000000000000000000000000000000000000000000000';
const TOGGLE_MODULE_ADDRESS = process.env.NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE;

async function checkOnChainExpiration() {
  console.log('🔍 Checking on-chain time restriction...\n');

  if (!TOGGLE_MODULE_ADDRESS || TOGGLE_MODULE_ADDRESS === '0x0000000000000000000000000000000000000000') {
    console.log('⚠️  TimeBasedToggleModule address not configured');
    console.log('   NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE not set in .env');
    console.log('');
    console.log('💡 This means:');
    console.log('   - The time restriction might only be in the database');
    console.log('   - OR the module was never deployed/configured');
    console.log('   - OR it\'s configured differently');
    console.log('');
    console.log('✅ If the time restriction is database-only, you\'re done!');
    console.log('   The database update is sufficient for app-level enforcement.');
    console.log('');
    return;
  }

  console.log('✅ TimeBasedToggleModule configured:');
  console.log('   Address:', TOGGLE_MODULE_ADDRESS);
  console.log('');

  // Try Base Mainnet first
  console.log('🔍 Checking Base Mainnet...\n');
  const mainnetClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0]),
  });

  try {
    const result = await mainnetClient.readContract({
      address: TOGGLE_MODULE_ADDRESS,
      abi: TIME_BASED_ABI,
      functionName: 'getHatTimeWindow',
      args: [BigInt(HAT_ID)],
    });

    const [startTime, expiration, isActive, timeUntilExpiration] = result;

    console.log('✅ Found on-chain time restriction (Base Mainnet):\n');
    console.log('   Start Time:', startTime.toString());
    console.log('   Start Date:', startTime > 0n ? new Date(Number(startTime) * 1000).toLocaleString() : 'Immediate');
    console.log('');
    console.log('   Expiration:', expiration.toString());
    console.log('   Expiration Date:', expiration > 0n ? new Date(Number(expiration) * 1000).toLocaleString() : 'Never');
    console.log('');
    console.log('   Is Active:', isActive ? '✅ Yes' : '❌ No');
    console.log('   Time Until Expiration:', timeUntilExpiration.toString(), 'seconds');
    console.log('');

    if (expiration > 0n) {
      const expirationDate = new Date(Number(expiration) * 1000);
      const targetDate = new Date('2026-02-28T23:59:00');
      const currentExpiration = expirationDate.toISOString().split('T')[0];
      const targetExpiration = targetDate.toISOString().split('T')[0];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📊 STATUS');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Current On-Chain Expiration:', expirationDate.toLocaleString());
      console.log('Target Expiration:', targetDate.toLocaleString());
      console.log('');

      if (expirationDate >= targetDate) {
        console.log('✅ ON-CHAIN UPDATE NOT NEEDED');
        console.log('   The on-chain expiration is already at or past the target date.');
        console.log('');
      } else {
        console.log('⏳ ON-CHAIN UPDATE REQUIRED');
        console.log('   Current:', currentExpiration);
        console.log('   Target:  ', targetExpiration);
        console.log('');
        console.log('   You need to update the on-chain expiration to Feb 28, 2026.');
        console.log('');
        console.log('   Unix timestamp to set:', Math.floor(targetDate.getTime() / 1000));
        console.log('');
      }
    } else {
      console.log('ℹ️  No expiration set (HAT never expires on-chain)');
      console.log('   The database restriction is the only enforcement.');
      console.log('');
    }

  } catch (error) {
    console.log('❌ Error reading from Base Mainnet:', error.message);
    console.log('');
    console.log('💡 Trying Base Sepolia (testnet)...\n');

    // Try Base Sepolia
    const sepoliaClient = createPublicClient({
      chain: baseSepolia,
      transport: http(baseSepolia.rpcUrls.default.http[0]),
    });

    try {
      const result = await sepoliaClient.readContract({
        address: TOGGLE_MODULE_ADDRESS,
        abi: TIME_BASED_ABI,
        functionName: 'getHatTimeWindow',
        args: [BigInt(HAT_ID)],
      });

      const [startTime, expiration, isActive, timeUntilExpiration] = result;

      console.log('✅ Found on-chain time restriction (Base Sepolia):\n');
      console.log('   Start Time:', startTime.toString());
      console.log('   Expiration:', expiration.toString());
      console.log('   Is Active:', isActive);
      console.log('   Time Until Expiration:', timeUntilExpiration.toString(), 'seconds');
      console.log('');

      if (expiration > 0n) {
        console.log('   Expiration Date:', new Date(Number(expiration) * 1000).toLocaleString());
        console.log('');
        console.log('⏳ ON-CHAIN UPDATE REQUIRED (Sepolia)');
        console.log('   Update the expiration via the UI or TimeBasedToggleService');
        console.log('');
      }
    } catch (sepoliaError) {
      console.log('❌ Error reading from Base Sepolia:', sepoliaError.message);
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('💡 CONCLUSION');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('Could not read on-chain time restriction. This likely means:');
      console.log('');
      console.log('1. The TimeBasedToggleModule was never set up for this HAT');
      console.log('2. The time restriction is database-only');
      console.log('3. The module address in .env is incorrect');
      console.log('');
      console.log('✅ If option 1 or 2: You\'re done! Database update is sufficient.');
      console.log('⚠️  If option 3: Update NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE');
      console.log('');
    }
  }
}

checkOnChainExpiration()
  .then(() => {
    console.log('✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Check failed:', error);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Set Beta Tester HAT on-chain expiration (gasless via CDP)
 *
 * Updates the TimeBasedToggleModule contract to extend expiration to Feb 28, 2026
 *
 * Usage: node scripts/set-onchain-expiration.mjs
 *
 * Requirements:
 * - Wallet must be HAT admin (pod leader)
 * - Uses Coinbase Paymaster for gasless transaction
 */

import { createWalletClient, createPublicClient, http, custom } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';
import TimeBasedToggleModuleABI from '../src/contracts/TimeBasedToggleModuleABI.json' assert { type: 'json' };

dotenv.config();

const HAT_ID = '0x000000880001000b000000000000000000000000000000000000000000000000';
const TOGGLE_MODULE_ADDRESS = process.env.NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE;
const NEW_EXPIRATION = 1772341140n; // Feb 28, 2026 23:59:00 UTC

async function setOnChainExpiration() {
  console.log('🎩 Setting Beta Tester HAT on-chain expiration...\n');

  if (!TOGGLE_MODULE_ADDRESS) {
    console.error('❌ NEXT_PUBLIC_TIME_BASED_TOGGLE_MODULE not configured');
    process.exit(1);
  }

  console.log('HAT ID:', HAT_ID);
  console.log('Module:', TOGGLE_MODULE_ADDRESS);
  console.log('Network: Base Mainnet');
  console.log('New Expiration (Unix):', NEW_EXPIRATION.toString());
  console.log('New Expiration (Date):', new Date(Number(NEW_EXPIRATION) * 1000).toLocaleString());
  console.log('');

  // Check if browser wallet is available
  if (typeof window === 'undefined' || !global.ethereum) {
    console.log('⚠️  This script needs to run in a browser environment with wallet.');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 EASIER OPTION: Use the UI');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Since this is a Node.js script and needs wallet signing,');
    console.log('it\'s easier to use the app UI:');
    console.log('');
    console.log('1. Open your app and navigate to /pods');
    console.log('2. Find "Beta Testers Pod"');
    console.log('3. Click "Manage Roles" or "Edit Roles"');
    console.log('4. Find the "Beta Tester" role');
    console.log('5. Look for "Time Restriction" or "Expiration" settings');
    console.log('6. Update expiration to: February 28, 2026 at 23:59');
    console.log('7. Click "Commit Change" or "Update On-Chain"');
    console.log('8. Approve the transaction (it will be gasless!)');
    console.log('');
    console.log('The UI will use SetHatExpirationButton component which');
    console.log('handles the transaction with CDP Smart Account + Paymaster.');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('OR you can call TimeBasedToggleService directly in your');
    console.log('browser console while connected to the app:');
    console.log('');
    console.log('```javascript');
    console.log('const { TimeBasedToggleService } = await import(');
    console.log('  "./src/features/pods/services/TimeBasedToggleService.ts"');
    console.log(');');
    console.log('');
    console.log('const hatId = BigInt("' + HAT_ID + '");');
    console.log('const expiration = ' + NEW_EXPIRATION.toString() + 'n;');
    console.log('');
    console.log('const txHash = await TimeBasedToggleService.setHatExpiration(');
    console.log('  hatId,');
    console.log('  expiration');
    console.log(');');
    console.log('');
    console.log('console.log("Transaction hash:", txHash);');
    console.log('```');
    console.log('');
    return;
  }

  // If we get here, we're in a browser-like environment
  console.log('🔐 Connecting to wallet...\n');

  const walletClient = createWalletClient({
    chain: base,
    transport: custom(window.ethereum),
  });

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0]),
  });

  const [account] = await walletClient.getAddresses();
  console.log('Connected wallet:', account);
  console.log('');

  // Verify current expiration
  console.log('📖 Verifying current on-chain expiration...\n');

  const currentExpiration = await publicClient.readContract({
    address: TOGGLE_MODULE_ADDRESS,
    abi: TimeBasedToggleModuleABI,
    functionName: 'hatExpirations',
    args: [BigInt(HAT_ID)],
  });

  console.log('Current Expiration:', currentExpiration.toString());
  console.log('Current Date:', new Date(Number(currentExpiration) * 1000).toLocaleString());
  console.log('');

  if (currentExpiration >= NEW_EXPIRATION) {
    console.log('✅ On-chain expiration is already at or past target date!');
    console.log('   No update needed.');
    return;
  }

  console.log('🔄 Updating on-chain expiration...\n');

  const hash = await walletClient.writeContract({
    address: TOGGLE_MODULE_ADDRESS,
    abi: TimeBasedToggleModuleABI,
    functionName: 'setHatExpiration',
    args: [BigInt(HAT_ID), NEW_EXPIRATION],
    account,
  });

  console.log('✅ Transaction submitted!');
  console.log('   TX Hash:', hash);
  console.log('');
  console.log('⏳ Waiting for confirmation...\n');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ Transaction confirmed!');
  console.log('   Block:', receipt.blockNumber.toString());
  console.log('   Gas Used:', receipt.gasUsed.toString());
  console.log('');

  // Verify the update
  const newExpiration = await publicClient.readContract({
    address: TOGGLE_MODULE_ADDRESS,
    abi: TimeBasedToggleModuleABI,
    functionName: 'hatExpirations',
    args: [BigInt(HAT_ID)],
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ ON-CHAIN UPDATE COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('New Expiration:', newExpiration.toString());
  console.log('New Date:', new Date(Number(newExpiration) * 1000).toLocaleString());
  console.log('Matches Target:', newExpiration === NEW_EXPIRATION ? '✅ YES' : '❌ NO');
  console.log('');
  console.log('🎉 Beta Tester HAT now expires on Feb 28, 2026!');
  console.log('');
}

setOnChainExpiration()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    console.error(error.stack);
    process.exit(1);
  });

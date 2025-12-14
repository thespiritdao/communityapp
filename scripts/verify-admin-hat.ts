/**
 * Admin Wallet Verification Script
 *
 * Verifies that the admin wallet (POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY)
 * wears the Executive Pod Leader hat required for minting Beta Tester hats.
 *
 * Usage:
 *   tsx scripts/verify-admin-hat.ts
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration from environment
const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const EXEC_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
const BETA_TESTER_HAT = process.env.NEXT_PUBLIC_BETA_TESTER_HAT;

// Hats Protocol ABI for verification
const HATS_ABI = [
  {
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    name: 'isWearerOfHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
    ],
    name: 'viewHat',
    outputs: [
      { name: 'details', type: 'string' },
      { name: 'maxSupply', type: 'uint32' },
      { name: 'supply', type: 'uint32' },
      { name: 'eligibility', type: 'address' },
      { name: 'toggle', type: 'address' },
      { name: 'imageURI', type: 'string' },
      { name: 'lastHatId', type: 'uint16' },
      { name: 'mutable_', type: 'bool' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function verifyAdminHat() {
  console.log('\n🔍 ADMIN WALLET VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Check private key
  if (!ADMIN_PRIVATE_KEY) {
    console.error('❌ CRITICAL ERROR: No admin private key found!');
    console.error('\n📝 Required configuration:');
    console.error('   Set either POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY in .env');
    console.error('\nExample .env entry:');
    console.error('   POD_ADMIN_PRIVATE_KEY=0x1234567890abcdef...');
    process.exit(1);
  }

  // Step 2: Check hat configuration
  if (!EXEC_LEADER_HAT) {
    console.error('❌ CRITICAL ERROR: Executive Pod Leader hat ID not configured!');
    console.error('\n📝 Required configuration:');
    console.error('   Set NEXT_PUBLIC_EXECUTIVE_POD_LEADER in .env');
    console.error('\nExample .env entry:');
    console.error('   NEXT_PUBLIC_EXECUTIVE_POD_LEADER=0x0000008800010000000000000000000000000000000000000000000000000000');
    process.exit(1);
  }

  if (!BETA_TESTER_HAT) {
    console.warn('⚠️ WARNING: Beta Tester hat ID not configured');
    console.warn('   Set NEXT_PUBLIC_BETA_TESTER_HAT in .env');
  }

  // Step 3: Initialize wallet and client
  console.log('🔐 Loading admin wallet...');
  const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);
  console.log(`   Address: ${adminAccount.address}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('🌐 Connecting to Base network...');
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Hats Protocol: ${HATS_CONTRACT}\n`);

  try {
    // Step 4: Check Executive Pod Leader hat
    console.log('📋 Checking Executive Pod Leader hat...');
    console.log(`   Hat ID: ${EXEC_LEADER_HAT}`);

    const isWearer = await publicClient.readContract({
      address: HATS_CONTRACT as `0x${string}`,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [adminAccount.address, BigInt(EXEC_LEADER_HAT)],
    });

    if (isWearer) {
      console.log('   ✅ Admin wallet WEARS Executive Pod Leader hat\n');

      // Get hat details
      const hatDetails = await publicClient.readContract({
        address: HATS_CONTRACT as `0x${string}`,
        abi: HATS_ABI,
        functionName: 'viewHat',
        args: [BigInt(EXEC_LEADER_HAT)],
      });

      console.log('📊 Executive Pod Leader Hat Details:');
      console.log(`   Active: ${hatDetails[8] ? 'Yes ✅' : 'No ❌'}`);
      console.log(`   Supply: ${hatDetails[2]}/${hatDetails[1]} wearers`);
      console.log(`   Mutable: ${hatDetails[7] ? 'Yes' : 'No'}`);
      console.log('');

      // Check Beta Tester hat if configured
      if (BETA_TESTER_HAT) {
        console.log('📋 Checking Beta Tester hat configuration...');
        console.log(`   Hat ID: ${BETA_TESTER_HAT}`);

        const betaHatDetails = await publicClient.readContract({
          address: HATS_CONTRACT as `0x${string}`,
          abi: HATS_ABI,
          functionName: 'viewHat',
          args: [BigInt(BETA_TESTER_HAT)],
        });

        console.log(`   Active: ${betaHatDetails[8] ? 'Yes ✅' : 'No ❌'}`);
        console.log(`   Supply: ${betaHatDetails[2]}/${betaHatDetails[1]} wearers`);
        console.log(`   Mutable: ${betaHatDetails[7] ? 'Yes' : 'No'}`);
        console.log('');

        if (!betaHatDetails[8]) {
          console.warn('⚠️ WARNING: Beta Tester hat is INACTIVE!');
          console.warn('   New users will not be able to receive this hat.');
          console.warn('   Activate it in Hats Protocol before onboarding.\n');
        }
      }

      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ VERIFICATION PASSED');
      console.log('═══════════════════════════════════════════════════════════\n');
      console.log('Your admin wallet is correctly configured and can mint hats!');
      console.log('\n📋 Next steps:');
      console.log('   1. Deploy your changes to production');
      console.log('   2. Test onboarding with a new test wallet');
      console.log('   3. Monitor logs at /api/onboarding/mint-hat\n');

    } else {
      console.error('   ❌ Admin wallet DOES NOT wear Executive Pod Leader hat!\n');

      console.log('═══════════════════════════════════════════════════════════');
      console.log('❌ VERIFICATION FAILED');
      console.log('═══════════════════════════════════════════════════════════\n');

      console.error('🔧 REQUIRED FIX:');
      console.error('   The admin wallet must wear the Executive Pod Leader hat');
      console.error('   to mint Beta Tester hats to new users.\n');

      console.error('💡 How to fix:');
      console.error('   1. Use an address that already wears the Executive Pod Leader hat, OR');
      console.error('   2. Mint the Executive Pod Leader hat to this wallet:\n');
      console.error(`      Admin Wallet: ${adminAccount.address}`);
      console.error(`      Required Hat: ${EXEC_LEADER_HAT}\n`);

      console.error('   You can mint it via:');
      console.error('   - Hats Protocol UI: https://app.hatsprotocol.xyz');
      console.error('   - Your DAO multisig');
      console.error('   - Another admin wallet that has permission\n');

      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ ERROR during verification:');
    if (error instanceof Error) {
      console.error(`   ${error.message}\n`);

      if (error.message.includes('could not decode result data')) {
        console.error('💡 This might mean:');
        console.error('   - Wrong RPC URL or chain');
        console.error('   - Wrong Hats Protocol contract address');
        console.error('   - Invalid hat ID format\n');
      } else if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        console.error('💡 Network connection issue:');
        console.error('   - Check your RPC_URL is accessible');
        console.error('   - Verify internet connection');
        console.error('   - Try a different RPC endpoint\n');
      }
    } else {
      console.error('   Unknown error occurred\n');
    }

    console.error('Current configuration:');
    console.error(`   Chain: Base (${base.id})`);
    console.error(`   RPC: ${RPC_URL}`);
    console.error(`   Hats Contract: ${HATS_CONTRACT}`);
    console.error(`   Admin Wallet: ${adminAccount.address}\n`);

    process.exit(1);
  }
}

// Run verification
verifyAdminHat();

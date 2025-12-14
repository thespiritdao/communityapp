/**
 * Final Setup Check & Instructions
 *
 * Comprehensive check and clear instructions for production deployment
 */

import {
  createPublicClient,
  http,
  parseAbi,
  formatEther,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_PROTOCOL = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const EXEC_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
const SERVICE_WALLET_KEY = process.env.POD_ADMIN_PRIVATE_KEY;

const HATS_ABI = parseAbi([
  'function isWearerOfHat(address user, uint256 hatId) external view returns (bool)',
]);

async function checkSetup() {
  console.log('\n🎯 FINAL SETUP CHECK');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Validate config
  if (!SERVICE_WALLET_KEY) {
    console.error('❌ CRITICAL: POD_ADMIN_PRIVATE_KEY not found in .env\n');
    console.log('   This is your backend service wallet.');
    console.log('   Generate one with: tsx scripts/generate-service-wallet.ts\n');
    process.exit(1);
  }

  if (!EXEC_LEADER_HAT) {
    console.error('❌ CRITICAL: NEXT_PUBLIC_EXECUTIVE_POD_LEADER not found in .env\n');
    process.exit(1);
  }

  const serviceWallet = privateKeyToAccount(SERVICE_WALLET_KEY as `0x${string}`);

  console.log('📋 CONFIGURATION');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Service Wallet: ${serviceWallet.address}`);
  console.log(`Executive Leader Hat: ${EXEC_LEADER_HAT}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  // Check 1: Does service wallet have ETH?
  console.log('1️⃣  CHECKING SERVICE WALLET BALANCE');
  console.log('───────────────────────────────────────────────────────────\n');

  const balance = await publicClient.getBalance({ address: serviceWallet.address });
  const ethBalance = formatEther(balance);

  console.log(`   Balance: ${ethBalance} ETH`);

  if (balance === 0n) {
    console.log('   Status: ❌ No ETH (needs gas for transactions)\n');
    console.log('   → ACTION REQUIRED: Send 0.001 ETH to service wallet');
    console.log(`     Address: ${serviceWallet.address}\n`);
  } else if (balance < BigInt(1000000000000000)) { // Less than 0.001 ETH
    console.log('   Status: ⚠️  Low balance (may run out soon)\n');
    console.log('   → RECOMMENDED: Add more ETH for production');
    console.log(`     Address: ${serviceWallet.address}\n`);
  } else {
    console.log('   Status: ✅ Funded\n');
  }

  // Check 2: Does service wallet have Executive Pod Leader hat?
  console.log('2️⃣  CHECKING SERVICE WALLET HAT');
  console.log('───────────────────────────────────────────────────────────\n');

  const hasHat = await publicClient.readContract({
    address: HATS_PROTOCOL as `0x${string}`,
    abi: HATS_ABI,
    functionName: 'isWearerOfHat',
    args: [serviceWallet.address, BigInt(EXEC_LEADER_HAT)],
  });

  console.log(`   Has Executive Pod Leader Hat: ${hasHat ? '✅ Yes' : '❌ No'}`);

  if (!hasHat) {
    console.log('\n   → ACTION REQUIRED: Mint Executive Pod Leader hat to service wallet\n');
    console.log('   STEPS:');
    console.log('   1. Go to https://app.hatsprotocol.xyz');
    console.log('   2. Connect your Coinbase Smart Wallet (admin wallet)');
    console.log('   3. Find "Executive Pod Leader" hat');
    console.log('   4. Click "Mint Hat"');
    console.log(`   5. Enter recipient: ${serviceWallet.address}`);
    console.log('   6. Confirm transaction\n');
  } else {
    console.log('   Status: ✅ Has admin permissions\n');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  const allGood = hasHat && balance > 0n;

  if (allGood) {
    console.log('✅ ALL SYSTEMS READY!');
    console.log('\n   Your hat minting system is fully configured.');
    console.log('   Users can now sign up and receive Beta Tester hats.\n');
    console.log('   Test the full flow:');
    console.log('   1. Visit http://localhost:3000/?clear=true');
    console.log('   2. Complete signup (invite code → wallet → hat minting)');
    console.log('   3. Should redirect to /home successfully\n');
  } else {
    console.log('⚠️  SETUP INCOMPLETE - Actions needed:\n');

    if (!hasHat) {
      console.log('   🔧 FIX #1: Mint Executive Pod Leader hat to service wallet');
      console.log(`      Recipient: ${serviceWallet.address}`);
      console.log('      Via: https://app.hatsprotocol.xyz\n');
    }

    if (balance === 0n) {
      console.log('   🔧 FIX #2: Fund service wallet with ETH');
      console.log(`      Send to: ${serviceWallet.address}`);
      console.log('      Amount: 0.001 ETH (enough for ~100 signups)\n');
    }

    console.log('   After completing these steps, run this script again.\n');
  }

  console.log('═══════════════════════════════════════════════════════════\n');

  // Architecture reminder
  console.log('🏗️  ARCHITECTURE REMINDER');
  console.log('───────────────────────────────────────────────────────────\n');
  console.log('   Service Wallet = Backend signing wallet (this wallet)');
  console.log(`   Address: ${serviceWallet.address}`);
  console.log('   Purpose: Signs transactions to mint hats FOR users');
  console.log('   Location: Backend server only (never shown to users)\n');
  console.log('   User Wallet = Created by user during signup');
  console.log('   Purpose: User\'s personal wallet (receives the hat)');
  console.log('   Location: User\'s device (via CDP embedded wallet)\n');
  console.log('   Flow: Service wallet MINTS TO user wallet (not to itself)\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

checkSetup();

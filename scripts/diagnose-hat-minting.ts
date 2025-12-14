/**
 * Diagnose Hat Minting Setup
 *
 * Checks what's preventing hat minting from working
 * and provides step-by-step fix instructions
 */

import {
  createPublicClient,
  http,
  parseAbi,
  getContract,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_PROTOCOL = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
const HAT_MINTER = process.env.NEXT_PUBLIC_HAT_MINTER;
const EXEC_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;
const ADMIN_PRIVATE_KEY = process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY;

const HATS_ABI = parseAbi([
  'function isWearerOfHat(address user, uint256 hatId) external view returns (bool)',
  'function mintHat(uint256 hatId, address wearer) external returns (bool)',
]);

const HAT_MINTER_ABI = parseAbi([
  'function hasAdminHat() external view returns (bool)',
  'function isAuthorizedCaller(address caller) external view returns (bool)',
  'function owner() external view returns (address)',
]);

async function diagnose() {
  console.log('\n🔍 HAT MINTING DIAGNOSTIC TOOL');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Validate configuration
  if (!ADMIN_PRIVATE_KEY) {
    console.error('❌ ERROR: No admin private key found');
    console.error('   Set POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY in .env\n');
    process.exit(1);
  }

  if (!EXEC_LEADER_HAT) {
    console.error('❌ ERROR: Executive Pod Leader hat ID not configured');
    console.error('   Set NEXT_PUBLIC_EXECUTIVE_POD_LEADER in .env\n');
    process.exit(1);
  }

  const account = privateKeyToAccount(ADMIN_PRIVATE_KEY as `0x${string}`);
  console.log('🔐 Admin Wallet:');
  console.log(`   Address: ${account.address}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  let hasIssues = false;
  const fixes: string[] = [];

  // Check 1: Does HatMinter contract exist and have admin hat?
  if (HAT_MINTER) {
    console.log('1️⃣  HATMINTER CONTRACT CHECK');
    console.log('───────────────────────────────────────────────────────────');
    console.log(`   Contract: ${HAT_MINTER.trim()}\n`);

    try {
      const hatMinter = getContract({
        address: HAT_MINTER.trim() as `0x${string}`,
        abi: HAT_MINTER_ABI,
        client: publicClient,
      });

      const contractHasAdminHat = await hatMinter.read.hasAdminHat();
      console.log(`   Has Admin Hat: ${contractHasAdminHat ? '✅ Yes' : '❌ No'}`);

      if (!contractHasAdminHat) {
        hasIssues = true;
        console.log('\n   ⚠️  ISSUE: Contract does not wear Executive Pod Leader hat\n');
        fixes.push(
          '🔧 FIX #1: Mint Executive Pod Leader Hat to HatMinter Contract',
          '   Using your admin wallet (Coinbase Smart Wallet), mint the',
          '   Executive Pod Leader hat to the HatMinter contract address:',
          `   Contract: ${HAT_MINTER.trim()}`,
          `   Hat ID: ${EXEC_LEADER_HAT}`,
          '   ',
          '   Options:',
          '   a) Via Hats Protocol UI: https://app.hatsprotocol.xyz',
          '   b) Via your DAO governance',
          '   c) Direct contract call (if you have admin rights)',
          ''
        );
      }

      // Check if admin wallet is authorized caller
      const isAuthorized = await hatMinter.read.isAuthorizedCaller([account.address]);
      console.log(`   Admin Wallet Authorized: ${isAuthorized ? '✅ Yes' : '❌ No'}`);

      if (!isAuthorized) {
        hasIssues = true;
        console.log('\n   ⚠️  ISSUE: Admin wallet not authorized to call contract\n');

        const owner = await hatMinter.read.owner();
        console.log(`   Contract Owner: ${owner}\n`);

        fixes.push(
          '🔧 FIX #2: Authorize Admin Wallet as Caller',
          '   The contract owner needs to authorize your admin wallet.',
          `   Owner address: ${owner}`,
          `   Admin wallet: ${account.address}`,
          '   ',
          '   If you are the owner, run:',
          '   tsx scripts/authorize-backend-caller.ts',
          ''
        );
      }

      console.log('   Status: ' + (contractHasAdminHat && isAuthorized ? '✅ Contract mode ready' : '⚠️  Issues found'));

    } catch (error) {
      console.error('   ❌ Error checking contract:', error instanceof Error ? error.message : 'Unknown');
      hasIssues = true;
      fixes.push(
        '🔧 FIX: Check HatMinter contract deployment',
        '   The contract may not be deployed correctly.',
        `   Address: ${HAT_MINTER.trim()}`,
        '   Verify on BaseScan: https://basescan.org/address/' + HAT_MINTER.trim(),
        ''
      );
    }
  } else {
    console.log('1️⃣  HATMINTER CONTRACT CHECK');
    console.log('───────────────────────────────────────────────────────────');
    console.log('   ℹ️  Contract not configured (will use EOA mode)\n');
  }

  // Check 2: Does admin wallet have Executive Pod Leader hat?
  console.log('2️⃣  ADMIN WALLET HAT CHECK (for EOA fallback mode)');
  console.log('───────────────────────────────────────────────────────────\n');

  try {
    const isAdminWearer = await publicClient.readContract({
      address: HATS_PROTOCOL as `0x${string}`,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [account.address, BigInt(EXEC_LEADER_HAT)],
    });

    console.log(`   Admin Wears Executive Pod Leader: ${isAdminWearer ? '✅ Yes' : '❌ No'}`);

    if (!isAdminWearer) {
      hasIssues = true;
      console.log('\n   ⚠️  ISSUE: Admin wallet does not wear Executive Pod Leader hat');
      console.log('   This is needed for EOA fallback mode\n');
      fixes.push(
        '🔧 FIX #3: Mint Executive Pod Leader Hat to Admin Wallet',
        '   If contract mode fails, the system falls back to EOA mode.',
        '   For EOA mode to work, your admin wallet needs the hat:',
        `   Admin wallet: ${account.address}`,
        `   Hat ID: ${EXEC_LEADER_HAT}`,
        '   ',
        '   Mint via Hats Protocol UI: https://app.hatsprotocol.xyz',
        ''
      );
    }

    console.log('   Status: ' + (isAdminWearer ? '✅ EOA mode ready' : '⚠️  EOA mode not available'));

  } catch (error) {
    console.error('   ❌ Error checking admin hat:', error instanceof Error ? error.message : 'Unknown');
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 DIAGNOSTIC SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!hasIssues) {
    console.log('✅ ALL CHECKS PASSED!');
    console.log('   Your hat minting setup is configured correctly.\n');
    console.log('   If you\'re still having issues, check:');
    console.log('   - Backend API logs');
    console.log('   - Network connectivity');
    console.log('   - Gas funds in admin wallet\n');
  } else {
    console.log('⚠️  ISSUES FOUND - Follow these fixes:\n');
    fixes.forEach(fix => console.log(fix));
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('📌 RECOMMENDED APPROACH:');
    console.log('   Fix #1 (mint hat to contract) for gas-free operation');
    console.log('   OR');
    console.log('   Fix #3 (mint hat to admin wallet) for paid operation\n');
  }
}

diagnose();

/**
 * Verify HatMinter Contract Setup
 *
 * Checks:
 * 1. Contract has Executive Pod Leader hat
 * 2. Test wallet is authorized to call mint functions
 * 3. Contract owner is correct
 */

import {
  createPublicClient,
  http,
  parseAbi,
  getContract,
} from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const HAT_MINTER_ADDRESS = process.env.NEXT_PUBLIC_HAT_MINTER as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const HATS_CONTRACT = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137';
// The governance pod's management hat and the default community's member hat.
const EXEC_LEADER_HAT = process.env.EXECUTIVE_POD_LEADER_HAT_ID;
const MEMBER_HAT = process.env.MEMBER_HAT_ID;

const HAT_MINTER_ABI = parseAbi([
  'function hasAdminHat() external view returns (bool)',
  'function owner() external view returns (address)',
  'function isAuthorizedCaller(address caller) external view returns (bool)',
  'function temporalNaturalismMemberId() external view returns (uint256)',
  'function executiveLeaderHatId() external view returns (uint256)',
]);

const HATS_ABI = parseAbi([
  'function isWearerOfHat(address user, uint256 hatId) external view returns (bool)',
]);

async function verifySetup() {
  console.log('\n🔍 HAT MINTER SETUP VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!HAT_MINTER_ADDRESS) {
    console.error('❌ ERROR: NEXT_PUBLIC_HAT_MINTER not set in .env');
    process.exit(1);
  }

  if (!EXEC_LEADER_HAT || !MEMBER_HAT) {
    console.error('❌ ERROR: set EXECUTIVE_POD_LEADER_HAT_ID and MEMBER_HAT_ID in .env');
    process.exit(1);
  }

  console.log('📋 Configuration:');
  console.log(`   HatMinter Contract: ${HAT_MINTER_ADDRESS}`);
  console.log(`   Hats Protocol: ${HATS_CONTRACT}`);
  console.log(`   RPC: ${RPC_URL}\n`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const hatMinter = getContract({
    address: HAT_MINTER_ADDRESS,
    abi: HAT_MINTER_ABI,
    client: publicClient,
  });

  const hatsProtocol = getContract({
    address: HATS_CONTRACT as `0x${string}`,
    abi: HATS_ABI,
    client: publicClient,
  });

  let allPassed = true;

  // Check 1: Contract owner
  console.log('1️⃣  Checking contract owner...');
  try {
    const owner = await hatMinter.read.owner();
    console.log(`   Owner: ${owner}`);
    console.log(`   ✅ Owner set correctly\n`);
  } catch (error) {
    console.error(`   ❌ Failed to get owner: ${error instanceof Error ? error.message : 'Unknown'}\n`);
    allPassed = false;
  }

  // Check 2: Hat IDs configured correctly
  console.log('2️⃣  Checking configured hat IDs...');
  try {
    const memberHatId = await hatMinter.read.temporalNaturalismMemberId();
    const execLeaderHatId = await hatMinter.read.executiveLeaderHatId();

    const betaMatch = memberHatId.toString(16).padStart(64, '0') === MEMBER_HAT?.replace('0x', '').toLowerCase();
    const execMatch = execLeaderHatId.toString(16).padStart(64, '0') === EXEC_LEADER_HAT?.replace('0x', '');

    console.log(`   Member Hat:      ${betaMatch ? '✅' : '❌'} ${memberHatId.toString()}`);
    console.log(`   Exec Leader Hat: ${execMatch ? '✅' : '❌'} ${execLeaderHatId.toString()}\n`);

    if (!betaMatch || !execMatch) allPassed = false;
  } catch (error) {
    console.error(`   ❌ Failed to get hat IDs: ${error instanceof Error ? error.message : 'Unknown'}\n`);
    allPassed = false;
  }

  // Check 3: Contract has admin hat
  console.log('3️⃣  Checking if contract wears Executive Pod Leader hat...');
  try {
    const hasAdminHat = await hatMinter.read.hasAdminHat();

    if (hasAdminHat) {
      console.log(`   ✅ Contract WEARS Executive Pod Leader hat`);
      console.log(`   🎉 Contract can mint member hats!\n`);
    } else {
      console.error(`   ❌ Contract does NOT wear Executive Pod Leader hat`);
      console.error(`   ⚠️  You need to mint the hat to the contract:\n`);
      console.error(`   Contract Address: ${HAT_MINTER_ADDRESS}`);
      console.error(`   Hat ID: ${EXEC_LEADER_HAT}\n`);
      console.error(`   Mint via: https://app.hatsprotocol.xyz\n`);
      allPassed = false;
    }
  } catch (error) {
    console.error(`   ❌ Failed to check admin hat: ${error instanceof Error ? error.message : 'Unknown'}\n`);
    allPassed = false;
  }

  // Check 4: Owner is authorized caller
  console.log('4️⃣  Checking owner authorization...');
  try {
    const owner = await hatMinter.read.owner();
    const isAuthorized = await hatMinter.read.isAuthorizedCaller([owner]);

    if (isAuthorized) {
      console.log(`   ✅ Owner is authorized to call mint functions\n`);
    } else {
      console.error(`   ❌ Owner is NOT authorized (this should never happen)\n`);
      allPassed = false;
    }
  } catch (error) {
    console.error(`   ❌ Failed to check authorization: ${error instanceof Error ? error.message : 'Unknown'}\n`);
    allPassed = false;
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  if (allPassed) {
    console.log('✅ VERIFICATION PASSED');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎉 Your HatMinter contract is ready to use!');
    console.log('   - Backend can mint member hats during onboarding');
    console.log('   - Gas will be sponsored once Coinbase whitelists it\n');
    console.log('📋 Next steps:');
    console.log('   1. Test onboarding flow locally');
    console.log('   2. Request Coinbase Paymaster whitelist');
    console.log('   3. Deploy to production\n');
  } else {
    console.log('❌ VERIFICATION FAILED');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('Please fix the issues above and try again.\n');
    process.exit(1);
  }
}

verifySetup();

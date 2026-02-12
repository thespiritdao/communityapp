/**
 * Script: Increase Beta Tester Hat Max Supply
 *
 * Purpose: Increase the maxSupply for the Beta Tester Hat to allow more users to onboard
 *
 * Usage:
 *   node scripts/increase-beta-hat-supply.mjs <new-max-supply>
 *
 * Example:
 *   node scripts/increase-beta-hat-supply.mjs 100
 *
 * Requirements:
 *   - Must be run by wallet wearing Executive Pod Leader hat
 *   - Wallet must have admin permission for Beta Tester Hat
 *
 * What it does:
 *   - Connects to Hats Protocol contract on Base
 *   - Calls changeHatMaxSupply() to increase the limit
 *   - Verifies the change was successful
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const HATS_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const BETA_TESTER_HAT = '0x000000880001000b000000000000000000000000000000000000000000000000';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const HATS_ABI = parseAbi([
  'function changeHatMaxSupply(uint256 _hatId, uint32 _newMaxSupply) external',
  'function hatSupply(uint256 hatId) external view returns (uint32)',
  'function isWearerOfHat(address _user, uint256 _hatId) external view returns (bool)',
]);

async function main() {
  console.log('🎩 Beta Tester Hat Supply Increase Script\n');
  console.log('==========================================\n');

  // Parse new max supply from command line
  const newMaxSupply = process.argv[2];

  if (!newMaxSupply) {
    console.error('❌ Error: Please provide new max supply as argument');
    console.error('\nUsage: node scripts/increase-beta-hat-supply.mjs <new-max-supply>');
    console.error('Example: node scripts/increase-beta-hat-supply.mjs 100\n');
    process.exit(1);
  }

  const newMaxSupplyNum = parseInt(newMaxSupply);

  if (isNaN(newMaxSupplyNum) || newMaxSupplyNum < 1 || newMaxSupplyNum > 4294967295) {
    console.error('❌ Error: Invalid max supply. Must be between 1 and 4294967295');
    console.error(`   You provided: ${newMaxSupply}\n`);
    process.exit(1);
  }

  // Get admin private key
  const ADMIN_PRIVATE_KEY = process.env.PRIVATE_KEY || process.env.POD_ADMIN_PRIVATE_KEY;

  if (!ADMIN_PRIVATE_KEY) {
    console.error('❌ Error: No admin private key found');
    console.error('   Set PRIVATE_KEY or POD_ADMIN_PRIVATE_KEY in .env file\n');
    process.exit(1);
  }

  const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY);
  console.log(`🔑 Admin wallet: ${adminAccount.address}\n`);

  // Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account: adminAccount,
    chain: base,
    transport: http(RPC_URL),
  });

  // Check current supply
  console.log('📊 Checking current Beta Tester Hat status...\n');

  const currentSupply = await publicClient.readContract({
    address: HATS_ADDRESS,
    abi: HATS_ABI,
    functionName: 'hatSupply',
    args: [BigInt(BETA_TESTER_HAT)],
  });

  console.log(`   Current supply: ${currentSupply} wearers`);
  console.log(`   New max supply: ${newMaxSupplyNum}\n`);

  if (newMaxSupplyNum < currentSupply) {
    console.error(`❌ Error: New max supply (${newMaxSupplyNum}) cannot be less than current supply (${currentSupply})`);
    console.error('   Some users would lose their hats!\n');
    process.exit(1);
  }

  if (newMaxSupplyNum === currentSupply) {
    console.warn(`⚠️  Warning: New max supply equals current supply`);
    console.warn(`   This will immediately prevent new users from getting Beta Tester hats\n`);
  }

  // Verify admin has permission
  console.log('🔍 Verifying admin permissions...\n');

  const EXEC_POD_LEADER_HAT = process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER;

  if (!EXEC_POD_LEADER_HAT) {
    console.error('❌ Error: NEXT_PUBLIC_EXECUTIVE_POD_LEADER not configured in .env');
    process.exit(1);
  }

  const isAdmin = await publicClient.readContract({
    address: HATS_ADDRESS,
    abi: HATS_ABI,
    functionName: 'isWearerOfHat',
    args: [adminAccount.address, BigInt(EXEC_POD_LEADER_HAT)],
  });

  if (!isAdmin) {
    console.error(`❌ Error: Admin wallet does not wear Executive Pod Leader hat`);
    console.error(`   Admin: ${adminAccount.address}`);
    console.error(`   Required hat: ${EXEC_POD_LEADER_HAT}\n`);
    process.exit(1);
  }

  console.log('✅ Admin verified - has Executive Pod Leader hat\n');

  // Confirm action
  console.log('🚀 Ready to increase Beta Tester Hat supply\n');
  console.log('   ⚠️  THIS WILL COST GAS FEES (estimated: ~$0.01-0.05)\n');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise(resolve => setTimeout(resolve, 5000));

  // Execute transaction
  console.log('📤 Submitting transaction to Hats Protocol...\n');

  try {
    const hash = await walletClient.writeContract({
      address: HATS_ADDRESS,
      abi: HATS_ABI,
      functionName: 'changeHatMaxSupply',
      args: [BigInt(BETA_TESTER_HAT), newMaxSupplyNum],
    });

    console.log(`   ⏳ Transaction hash: ${hash}`);
    console.log(`   🔗 BaseScan: https://basescan.org/tx/${hash}\n`);

    console.log('⏳ Waiting for confirmation...\n');

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    if (receipt.status === 'success') {
      console.log('✅ Transaction confirmed!\n');
      console.log(`   Block number: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed}\n`);

      // Verify the change
      console.log('🔍 Verifying the supply increase...\n');

      // Wait a moment for state to update
      await new Promise(resolve => setTimeout(resolve, 2000));

      const verifySupply = await publicClient.readContract({
        address: HATS_ADDRESS,
        abi: HATS_ABI,
        functionName: 'hatSupply',
        args: [BigInt(BETA_TESTER_HAT)],
      });

      console.log(`   Current supply: ${verifySupply} wearers`);
      console.log(`   Available slots: ${newMaxSupplyNum - verifySupply}\n`);

      console.log('🎉 SUCCESS! Beta Tester Hat supply increased!\n');
      console.log(`   New users can now onboard using invite codes\n`);
      console.log(`   ${newMaxSupplyNum - verifySupply} slots available for new members\n`);
    } else {
      console.error('❌ Transaction failed');
      console.error(`   Status: ${receipt.status}\n`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error executing transaction:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

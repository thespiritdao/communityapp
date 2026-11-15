/**
 * Change a hat's maxSupply (Hats Protocol changeHatMaxSupply).
 *
 * Usage:
 *   node scripts/ops/set-hat-max-supply.mjs <hatId> <new-max-supply>
 *
 * Example (raise a member hat's cap to 100):
 *   node scripts/ops/set-hat-max-supply.mjs 0x0000000100020001000100000000000000000000000000000000000000000000 100
 *
 * Signs with POD_ADMIN_PRIVATE_KEY (or PRIVATE_KEY), which must wear an admin
 * hat of the target hat. The new value cannot be below the current supply.
 */

import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const HATS_ADDRESS = process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137';
const TARGET_HAT = process.argv[2]; // target hat id
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

const HATS_ABI = parseAbi([
  'function changeHatMaxSupply(uint256 _hatId, uint32 _newMaxSupply) external',
  'function hatSupply(uint256 hatId) external view returns (uint32)',
  'function isAdminOfHat(address _user, uint256 _hatId) external view returns (bool)',
]);

async function main() {
  console.log('🎩 Hat max-supply change\n');
  console.log('==========================================\n');

  // Parse new max supply from command line
  const newMaxSupply = process.argv[3];

  if (!TARGET_HAT || !/^0x[0-9a-fA-F]{1,64}$/.test(TARGET_HAT) || !newMaxSupply) {
    console.error('❌ Error: provide a hat id and the new max supply');
    console.error('\nUsage: node scripts/ops/set-hat-max-supply.mjs <hatId> <new-max-supply>\n');
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
  console.log('📊 Checking current hat status...\n');

  const currentSupply = await publicClient.readContract({
    address: HATS_ADDRESS,
    abi: HATS_ABI,
    functionName: 'hatSupply',
    args: [BigInt(TARGET_HAT)],
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
    console.warn(`   This will immediately prevent new users from getting this hat\n`);
  }

  // Verify admin has permission
  console.log('🔍 Verifying admin permissions...\n');

  const isAdmin = await publicClient.readContract({
    address: HATS_ADDRESS,
    abi: HATS_ABI,
    functionName: 'isAdminOfHat',
    args: [adminAccount.address, BigInt(TARGET_HAT)],
  });

  if (!isAdmin) {
    console.error('❌ Error: the signing wallet is not an admin of this hat');
    console.error(`   Signer: ${adminAccount.address}`);
    console.error(`   Hat:    ${TARGET_HAT}\n`);
    process.exit(1);
  }

  console.log('✅ Signer is an admin of the hat\n');

  // Confirm action
  console.log('🚀 Ready to increase hat supply\n');
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
      args: [BigInt(TARGET_HAT), newMaxSupplyNum],
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
        args: [BigInt(TARGET_HAT)],
      });

      console.log(`   Current supply: ${verifySupply} wearers`);
      console.log(`   Available slots: ${newMaxSupplyNum - verifySupply}\n`);

      console.log('🎉 SUCCESS! hat supply increased!\n');
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

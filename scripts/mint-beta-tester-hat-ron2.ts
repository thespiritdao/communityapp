/**
 * Mint Beta Tester HAT to Ron Rivers #2
 *
 * This user has Advocate NFT but is missing Beta Tester HAT
 */
import dotenv from 'dotenv';
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const HATS_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as `0x${string}`;
const BETA_TESTER_HAT_ID = '0x000000880001000b000000000000000000000000000000000000000000000000';
const RON_RIVERS_2_ADDRESS = '0x12a0cf22d632c859b793f852af03b9d515580244' as `0x${string}`;

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const ADMIN_PRIVATE_KEY = (process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;

const HATS_ABI = parseAbi([
  'function mintHat(uint256 hatId, address wearer) external returns (bool)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

async function main() {
  console.log('🎩 MINT BETA TESTER HAT - RON RIVERS #2\n');
  console.log('═'.repeat(80));

  if (!ADMIN_PRIVATE_KEY) {
    console.error('❌ POD_ADMIN_PRIVATE_KEY or PRIVATE_KEY not configured in .env');
    process.exit(1);
  }

  const adminAccount = privateKeyToAccount(ADMIN_PRIVATE_KEY);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account: adminAccount,
    chain: base,
    transport: http(RPC_URL),
  });

  console.log(`🔑 Admin Wallet: ${adminAccount.address}`);
  console.log(`🎩 Beta Tester HAT: ${BETA_TESTER_HAT_ID}`);
  console.log(`👤 Recipient: ${RON_RIVERS_2_ADDRESS} (Ron Rivers #2)\n`);
  console.log('═'.repeat(80));

  try {
    // Check current balance
    console.log('\n🔍 Checking current Beta Tester HAT balance...');
    const currentBalance = await publicClient.readContract({
      address: HATS_ADDRESS,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [RON_RIVERS_2_ADDRESS, BigInt(BETA_TESTER_HAT_ID)],
    });

    console.log(`   Current balance: ${currentBalance}`);

    if (currentBalance > 0n) {
      console.log('\n✅ User already has Beta Tester HAT - no action needed');
      process.exit(0);
    }

    // Mint Beta Tester HAT
    console.log('\n📤 Minting Beta Tester HAT...');
    const hash = await walletClient.writeContract({
      address: HATS_ADDRESS,
      abi: HATS_ABI,
      functionName: 'mintHat',
      args: [BigInt(BETA_TESTER_HAT_ID), RON_RIVERS_2_ADDRESS],
    });

    console.log(`   ⏳ Transaction: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      timeout: 60_000,
    });

    if (receipt.status === 'success') {
      console.log('\n✅ SUCCESS!');
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas Used: ${receipt.gasUsed}`);

      // Verify new balance
      const newBalance = await publicClient.readContract({
        address: HATS_ADDRESS,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [RON_RIVERS_2_ADDRESS, BigInt(BETA_TESTER_HAT_ID)],
      });

      console.log(`\n🎉 Verification: New balance = ${newBalance}`);
      console.log('\n═'.repeat(80));
      console.log('\n✅ Ron Rivers #2 now has Beta Tester HAT!');
      console.log('   All 10 Beta Testers now have both HAT + Advocate NFT\n');
    } else {
      console.log('\n❌ Transaction reverted');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

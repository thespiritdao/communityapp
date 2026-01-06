/**
 * Retry Advocate NFT mints for the 5 failed addresses
 *
 * This script uses the ADMIN wallet (same as the original airdrop),
 * so it will use the admin's ETH for gas (NOT CDP Paymaster).
 *
 * Based on check-all-beta-tester-status.ts results:
 * - 4 users have Beta Tester HAT but NO Advocate
 * - 1 user (Ron Rivers #2) has NEITHER
 */
import dotenv from 'dotenv';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const ADMIN_PRIVATE_KEY = (process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;

// Only the 5 addresses that DON'T have Advocate NFTs (from check-all-beta-tester-status.ts)
const FAILED_RECIPIENTS = [
  { name: 'Eric Miki', address: '0x62421b696132bb635feba0e3cb2f305637cb7ead' },
  { name: 'Mariah McKay', address: '0xe3ddfd2b214d51316533181248a4106f83e4934c' },
  { name: 'Tressa Rivers', address: '0xaecf4d00f0e402fbeb0757f22be9062d89018106' },
  { name: 'René Pinnell', address: '0x0259c4b65866d8f9e596052dbcdfc142c28b6329' },
  { name: 'Ron Rivers #2', address: '0x12a0cf22d632c859b793f852af03b9d515580244' },
];

const ADVOCATE_ABI = parseAbi([
  'function mint(address to, uint8 memberType, string memory uri) external',
  'function balanceOf(address account) external view returns (uint256)',
]);

async function main() {
  console.log('🔄 RETRY ADVOCATE NFT MINTS\n');
  console.log('═'.repeat(80));

  if (!ADVOCATE_ADDRESS) {
    console.error('❌ NEXT_PUBLIC_ADVOCATE not configured in .env');
    process.exit(1);
  }

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
  console.log(`🎖️  Advocate NFT: ${ADVOCATE_ADDRESS}`);
  console.log(`👥 Recipients: ${FAILED_RECIPIENTS.length}\n`);
  console.log('═'.repeat(80));

  const results = {
    success: [] as string[],
    failed: [] as { name: string; error: string }[],
  };

  for (let i = 0; i < FAILED_RECIPIENTS.length; i++) {
    const recipient = FAILED_RECIPIENTS[i];
    const addr = recipient.address as `0x${string}`;

    console.log(`\n[${i + 1}/${FAILED_RECIPIENTS.length}] ${recipient.name}`);
    console.log(`   Address: ${addr}`);

    try {
      // Double-check current balance
      const balance = await publicClient.readContract({
        address: ADVOCATE_ADDRESS,
        abi: ADVOCATE_ABI,
        functionName: 'balanceOf',
        args: [addr],
      });

      if (balance > 0n) {
        console.log(`   ✅ Already has ${balance} Advocate NFT - skipping`);
        results.success.push(recipient.name);
        continue;
      }

      // Mint
      console.log('   📤 Minting Advocate NFT...');
      const hash = await walletClient.writeContract({
        address: ADVOCATE_ADDRESS,
        abi: ADVOCATE_ABI,
        functionName: 'mint',
        args: [addr, 0, ''], // (address to, uint8 memberType, string uri)
      });

      console.log(`   ⏳ Tx: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });

      if (receipt.status === 'success') {
        console.log(`   ✅ SUCCESS!`);
        console.log(`      Block: ${receipt.blockNumber}`);
        console.log(`      Gas: ${receipt.gasUsed}`);
        results.success.push(recipient.name);
      } else {
        console.log(`   ❌ Transaction reverted`);
        results.failed.push({ name: recipient.name, error: 'Transaction reverted' });
      }

      // Rate limiting
      if (i < FAILED_RECIPIENTS.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ❌ ERROR: ${errorMsg}`);
      results.failed.push({ name: recipient.name, error: errorMsg });
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 FINAL RESULTS\n');
  console.log(`✅ Successful: ${results.success.length}/${FAILED_RECIPIENTS.length}`);
  if (results.success.length > 0) {
    results.success.forEach(name => console.log(`   - ${name}`));
  }

  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}/${FAILED_RECIPIENTS.length}`);
    results.failed.forEach(({ name, error }) => console.log(`   - ${name}: ${error}`));
  }

  console.log('\n' + '═'.repeat(80));

  if (results.failed.length > 0) {
    console.log('\n⚠️  NEXT STEPS FOR FAILURES:');
    console.log('   1. Check if admin wallet has enough ETH for gas');
    console.log('   2. Verify admin wallet is the owner of Advocate contract');
    console.log('   3. Check failed addresses on BaseScan for contract deployment status');
    console.log('   4. Consider manual minting via BaseScan UI if script continues to fail\n');
  } else {
    console.log('\n🎉 ALL MINTS SUCCESSFUL!');
    console.log('\n📧 Next: Email users to delegate their Advocate NFTs:');
    console.log('   Visit https://spiritdao.org/governance');
    console.log('   Click "Delegate to Self"');
    console.log('   This activates voting power\n');
  }
}

main()
  .then(() => {
    console.log('✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

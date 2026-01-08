/**
 * Retry failed Advocate NFT mints
 *
 * For Coinbase Smart Wallets that failed _safeMint, we need to:
 * 1. Ensure the wallet is activated on-chain first
 * 2. Then retry the mint
 *
 * However, since we can't modify the deployed contract, we'll try
 * sending a small amount of ETH to activate the wallet first.
 */
import dotenv from 'dotenv';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
  parseEther,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const ADMIN_PRIVATE_KEY = (process.env.POD_ADMIN_PRIVATE_KEY || process.env.PRIVATE_KEY) as `0x${string}`;

// Failed recipients
const FAILED_RECIPIENTS = [
  { address: '0x62421b696132bb635feba0e3cb2f305637cb7ead', name: 'Eric Miki' },
  { address: '0xe3ddfd2b214d51316533181248a4106f83e4934c', name: 'Mariah McKay' },
  { address: '0xaecf4d00f0e402fbeb0757f22be9062d89018106', name: 'Tressa Rivers' },
  { address: '0x0259c4b65866d8f9e596052dbcdfc142c28b6329', name: 'René Pinnell' },
  { address: '0x12a0cf22d632c859b793f852af03b9d515580244', name: 'Ron Rivers #2' },
];

const ADVOCATE_ABI = parseAbi([
  'function mint(address to, uint8 memberType, string memory uri) external',
  'function balanceOf(address account) external view returns (uint256)',
]);

async function main() {
  console.log('🔄 Retrying Failed Mints\n');

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

  console.log(`Admin: ${adminAccount.address}`);
  console.log(`Advocate: ${ADVOCATE_ADDRESS}\n`);

  const results = {
    success: [] as string[],
    failed: [] as { name: string; error: string }[],
  };

  for (const recipient of FAILED_RECIPIENTS) {
    const addr = recipient.address as `0x${string}`;
    console.log(`\n📤 Processing: ${recipient.name}`);
    console.log(`   Address: ${addr}`);

    try {
      // Check current balance
      const balance = await publicClient.readContract({
        address: ADVOCATE_ADDRESS,
        abi: ADVOCATE_ABI,
        functionName: 'balanceOf',
        args: [addr],
      });

      if (balance > 0n) {
        console.log(`   ✅ Already has NFT - skipping`);
        results.success.push(recipient.name);
        continue;
      }

      // ALWAYS send activation transaction first to ensure wallet is deployed
      console.log(`   ⚡ Ensuring wallet is activated with 0.000001 ETH...`);
      try {
        const activationHash = await walletClient.sendTransaction({
          to: addr,
          value: parseEther('0.000001'),
        });

        await publicClient.waitForTransactionReceipt({
          hash: activationHash,
          timeout: 30_000,
        });
        console.log(`   ✅ Activation tx confirmed: ${activationHash}`);

        // Wait for state to settle
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (activationError) {
        console.log(`   ⚠️  Activation tx failed (wallet may already be active): ${activationError instanceof Error ? activationError.message : activationError}`);
        // Continue anyway - wallet might already be active
      }

      // Attempt mint
      console.log(`   🎖️  Minting Advocate NFT...`);
      const hash = await walletClient.writeContract({
        address: ADVOCATE_ADDRESS,
        abi: ADVOCATE_ABI,
        functionName: 'mint',
        args: [addr, 0, ''],
      });

      console.log(`   ⏳ Transaction: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 60_000,
      });

      if (receipt.status === 'success') {
        console.log(`   ✅ Success! Block: ${receipt.blockNumber}`);
        console.log(`   ⛽ Gas: ${receipt.gasUsed}`);
        results.success.push(recipient.name);
      } else {
        console.log(`   ❌ Transaction reverted`);
        results.failed.push({ name: recipient.name, error: 'Reverted' });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ❌ Error: ${errorMsg}`);
      results.failed.push({ name: recipient.name, error: errorMsg });
    }
  }

  // Summary
  console.log('\n\n═══════════════════════════════');
  console.log('📊 RETRY SUMMARY');
  console.log('═══════════════════════════════\n');

  console.log(`✅ Success: ${results.success.length}`);
  results.success.forEach(name => console.log(`   - ${name}`));

  console.log(`\n❌ Failed: ${results.failed.length}`);
  results.failed.forEach(({ name, error }) => console.log(`   - ${name}: ${error}`));
}

main()
  .then(() => {
    console.log('\n✅ Retry complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

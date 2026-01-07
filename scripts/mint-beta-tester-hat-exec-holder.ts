// scripts/mint-beta-tester-hat-exec-holder.ts
// Mint Beta Tester HAT for Exec Pod holder who can't access pod management
// Wallet: 0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48

import { createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Contract addresses
const HATS_CONTRACT = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137'; // Hats Protocol on Base
const BETA_TESTER_HAT_ID = '0x0000000200010001000000000000000000000000000000000000000000000000'; // From your config

// Admin wallet (must have authority to mint Beta Tester HATs)
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;
if (!ADMIN_PRIVATE_KEY) {
  throw new Error('ADMIN_PRIVATE_KEY not found in environment variables');
}

// User to receive Beta Tester HAT
const RECIPIENT_ADDRESS = '0xcdf3cd4777286a5611b17869a509e8ecf1cc6f48';

const account = privateKeyToAccount(`0x${ADMIN_PRIVATE_KEY.replace(/^0x/, '')}`);

const walletClient = createWalletClient({
  account,
  chain: base,
  transport: http(),
});

// Hats Protocol ABI for mintHat
const HATS_ABI = parseAbi([
  'function mintHat(uint256 hatId, address wearer) external returns (bool)',
  'function isWearerOfHat(address wearer, uint256 hatId) external view returns (bool)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)',
]);

async function main() {
  console.log('🎩 Minting Beta Tester HAT for Exec Pod Holder');
  console.log('==================================================');
  console.log('Recipient:', RECIPIENT_ADDRESS);
  console.log('Beta Tester HAT ID:', BETA_TESTER_HAT_ID);
  console.log('Admin:', account.address);
  console.log('');

  try {
    // 1. Check if user already has Beta Tester HAT
    console.log('1. Checking if user already has Beta Tester HAT...');
    const balance = await walletClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [RECIPIENT_ADDRESS, BigInt(BETA_TESTER_HAT_ID)],
    });

    if (balance > 0n) {
      console.log('✅ User already has Beta Tester HAT (balance:', balance.toString(), ')');
      console.log('No need to mint.');
      return;
    }

    console.log('   User does not have Beta Tester HAT yet');
    console.log('');

    // 2. Mint Beta Tester HAT
    console.log('2. Minting Beta Tester HAT...');
    const hash = await walletClient.writeContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'mintHat',
      args: [BigInt(BETA_TESTER_HAT_ID), RECIPIENT_ADDRESS],
    });

    console.log('   Transaction hash:', hash);
    console.log('   Waiting for confirmation...');

    // Wait for transaction confirmation
    const receipt = await walletClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      console.log('✅ Beta Tester HAT minted successfully!');
      console.log('   Block number:', receipt.blockNumber);
      console.log('   Gas used:', receipt.gasUsed.toString());
    } else {
      console.log('❌ Transaction reverted');
      console.log('   Receipt:', receipt);
    }

    console.log('');

    // 3. Verify mint
    console.log('3. Verifying mint...');
    const newBalance = await walletClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'balanceOf',
      args: [RECIPIENT_ADDRESS, BigInt(BETA_TESTER_HAT_ID)],
    });

    const isWearer = await walletClient.readContract({
      address: HATS_CONTRACT,
      abi: HATS_ABI,
      functionName: 'isWearerOfHat',
      args: [RECIPIENT_ADDRESS, BigInt(BETA_TESTER_HAT_ID)],
    });

    console.log('   Beta Tester HAT balance:', newBalance.toString());
    console.log('   Is wearer:', isWearer);

    if (newBalance > 0n && isWearer) {
      console.log('');
      console.log('🎉 SUCCESS! User now has Beta Tester HAT');
      console.log('');
      console.log('Next steps:');
      console.log('1. User can now access pod management');
      console.log('2. User should refresh the page');
      console.log('3. Verify Exec Pod management panel is visible');
    } else {
      console.log('');
      console.log('⚠️ WARNING: Mint transaction succeeded but verification failed');
      console.log('Please check Basescan:', `https://basescan.org/tx/${hash}`);
    }

  } catch (error: any) {
    console.error('❌ Error minting Beta Tester HAT:');
    console.error(error);

    if (error.message?.includes('NotAdmin')) {
      console.error('');
      console.error('The admin wallet does not have permission to mint Beta Tester HATs.');
      console.error('Please ensure the admin wallet is set as an admin for this HAT.');
    }

    process.exit(1);
  }
}

main()
  .then(() => {
    console.log('');
    console.log('Script completed successfully ✓');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

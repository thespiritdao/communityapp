import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import 'dotenv/config';

const MINTING_WALLET = '0x71357bC9b9A8346e87d03E162D25fdf6c0bea449';

const publicClient = createPublicClient({
  chain: base,
  transport: http(),
});

console.log('🔍 Checking minting wallet balance...\n');

try {
  const balance = await publicClient.getBalance({
    address: MINTING_WALLET,
  });

  console.log('💼 MINTING WALLET BALANCE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Address: ${MINTING_WALLET}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (balance === 0n) {
    console.log('❌ Wallet has ZERO ETH');
    console.log('⚠️  Backend server wallets CANNOT use gasless transactions');
    console.log('⚠️  Only frontend Smart Wallets support paymaster/gasless\n');
    console.log('💡 SOLUTION: Fund this wallet with ~0.001 ETH for gas');
    console.log('   Estimated gas per mint: ~0.0001 ETH');
    console.log('   0.001 ETH = ~10 minting transactions\n');
  } else {
    const estimatedMints = Number(balance) / 100000000000000n; // ~0.0001 ETH per tx
    console.log(`✅ Wallet has sufficient balance for ~${Math.floor(estimatedMints)} minting transactions`);
  }

} catch (error) {
  console.error('❌ Error checking balance:', error.message);
}

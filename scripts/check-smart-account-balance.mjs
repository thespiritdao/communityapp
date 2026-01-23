import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const publicClient = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
});

const SMART_ACCOUNT_ADDRESS = '0xCDF3cD4777286A5611b17869a509E8Ecf1CC6F48'; // From your bounty data

async function checkBalance() {
  console.log(`\n🔍 Checking Smart Account Balance...`);
  console.log(`📍 Address: ${SMART_ACCOUNT_ADDRESS}`);
  console.log(`🌐 Network: Base Mainnet\n`);

  try {
    const balance = await publicClient.getBalance({
      address: SMART_ACCOUNT_ADDRESS,
    });

    console.log(`💰 ETH Balance: ${formatEther(balance)} ETH`);

    if (balance === 0n) {
      console.log('\n⚠️  WARNING: Smart Account has ZERO balance!');
      console.log('   This may prevent transactions from being bundled.');
      console.log('   Even with a paymaster, some bundlers require a minimum balance.');
    } else {
      console.log('\n✅ Smart Account has sufficient balance');
    }

    // Check transaction count
    const txCount = await publicClient.getTransactionCount({
      address: SMART_ACCOUNT_ADDRESS,
    });

    console.log(`📝 Transaction Count (nonce): ${txCount}`);

    if (txCount === 0) {
      console.log('   ⚠️  No transactions sent from this account yet');
    } else {
      console.log(`   ✅ ${txCount} transactions sent successfully`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkBalance()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });

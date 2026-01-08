import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';

const FAUCET_ADDRESS = '0x4156673cdae173f179358d6951C446de837dC42d';
const FUNDING_TX = '0xc7d105cc8047bb3394012056a183c4a8b1873786d9c42e6eff55a77db044af81';

async function main() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  console.log('🔍 Tracing ETH movement from faucet wallet');
  console.log(`Wallet: ${FAUCET_ADDRESS}`);
  console.log(`Funding TX: ${FUNDING_TX}\n`);

  // Get current balance
  const balance = await publicClient.getBalance({ address: FAUCET_ADDRESS as `0x${string}` });
  console.log(`Current Balance: ${formatEther(balance)} ETH`);
  console.log('');

  // Get recent transactions
  console.log('📋 Fetching recent transactions...');

  const latestBlock = await publicClient.getBlockNumber();
  console.log(`Latest block: ${latestBlock}`);
  console.log('');

  // Get transaction count (nonce)
  const txCount = await publicClient.getTransactionCount({ address: FAUCET_ADDRESS as `0x${string}` });
  console.log(`Transaction count (nonce): ${txCount}`);
  console.log('');

  console.log('🔍 Checking if there are pending transactions...');
  const pendingTxCount = await publicClient.getTransactionCount({
    address: FAUCET_ADDRESS as `0x${string}`,
    blockTag: 'pending'
  });

  if (pendingTxCount > txCount) {
    console.log(`⚠️  WARNING: ${pendingTxCount - txCount} pending transactions!`);
  } else {
    console.log('✅ No pending transactions');
  }

  console.log('');
  console.log('💡 To see where ETH went, check BaseScan transaction history:');
  console.log(`   https://basescan.org/address/${FAUCET_ADDRESS}`);
}

main().catch(console.error);

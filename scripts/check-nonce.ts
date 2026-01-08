/**
 * Check wallet nonce and pending transactions
 */

import dotenv from 'dotenv';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const FAUCET_PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

async function main() {
  if (!FAUCET_PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY not set in .env');
    process.exit(1);
  }

  const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('🔍 Checking faucet wallet nonce');
  console.log(`Address: ${account.address}`);
  console.log('');

  // Get current nonce (number of confirmed transactions)
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
  });

  // Get pending nonce (includes pending transactions)
  const pendingNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });

  // Check ETH balance for gas
  const balance = await publicClient.getBalance({
    address: account.address,
  });

  console.log(`Current Nonce: ${nonce}`);
  console.log(`Pending Nonce: ${pendingNonce}`);
  console.log(`ETH Balance: ${Number(balance) / 1e18} ETH`);
  console.log('');

  if (nonce !== pendingNonce) {
    console.log(`⚠️  WARNING: There are ${pendingNonce - nonce} pending transactions!`);
    console.log(`   You may need to wait for them to confirm or replace them.`);
  } else {
    console.log(`✅ No pending transactions`);
  }

  if (Number(balance) < 0.001e18) {
    console.log(`⚠️  WARNING: Low ETH balance for gas!`);
    console.log(`   You need ETH to pay for transaction gas.`);
  } else {
    console.log(`✅ Sufficient ETH for gas`);
  }
}

main().catch(console.error);

/**
 * Fund Faucet and Execute Airdrop
 *
 * This script will:
 * 1. Send 0.002 ETH from YOUR wallet to the faucet wallet
 * 2. Wait for confirmation
 * 3. Execute the airdrop
 *
 * Usage: Connect your MetaMask/wallet and run via browser console
 */

import dotenv from 'dotenv';
import { createWalletClient, createPublicClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

dotenv.config();

const YOUR_PRIVATE_KEY = process.env.YOUR_WALLET_PRIVATE_KEY; // Add this to .env
const FAUCET_ADDRESS = '0x4156673cdae173f179358d6951C446de837dC42d';
const RPC_URL = 'https://mainnet.base.org';

async function main() {
  if (!YOUR_PRIVATE_KEY) {
    console.error('❌ Please set YOUR_WALLET_PRIVATE_KEY in .env');
    console.error('   This should be YOUR wallet that has ETH, not the faucet wallet');
    process.exit(1);
  }

  const yourAccount = privateKeyToAccount(YOUR_PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account: yourAccount,
    chain: base,
    transport: http(RPC_URL),
  });

  console.log('💰 Funding faucet wallet from your wallet');
  console.log(`From: ${yourAccount.address}`);
  console.log(`To: ${FAUCET_ADDRESS}`);
  console.log(`Amount: 0.002 ETH`);
  console.log('');

  // Check your balance
  const yourBalance = await publicClient.getBalance({ address: yourAccount.address });
  console.log(`Your balance: ${Number(yourBalance) / 1e18} ETH`);

  if (yourBalance < parseEther('0.002')) {
    console.error('❌ Insufficient ETH in your wallet');
    process.exit(1);
  }

  // Send ETH to faucet
  console.log('📤 Sending 0.002 ETH to faucet...');
  const hash = await walletClient.sendTransaction({
    to: FAUCET_ADDRESS,
    value: parseEther('0.002'),
  });

  console.log(`⏳ Transaction: ${hash}`);
  console.log('Waiting for confirmation...');

  await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ Funding complete!');
  console.log('');
  console.log('Now run: npx tsx scripts/batch-airdrop.ts');
}

main().catch(console.error);

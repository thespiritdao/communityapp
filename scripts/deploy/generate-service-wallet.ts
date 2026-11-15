/**
 * Generate Service Wallet for Backend Operations
 *
 * Creates a new EOA (Externally Owned Account) to use for:
 * - Minting member hats to new users
 * - Other automated backend operations
 *
 * Usage:
 *   tsx scripts/deploy/generate-service-wallet.ts
 *
 * WARNING: the new private key is printed to the terminal. Run this on a
 * machine you trust, copy the key straight into your secret store or .env,
 * and clear your terminal scrollback afterwards.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatEther } from 'viem';
import { base } from 'viem/chains';
import * as dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

async function generateServiceWallet() {
  console.log('\n🔐 SERVICE WALLET GENERATOR');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Generate new wallet
  console.log('⚙️  Generating new wallet...\n');
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  // Display wallet info
  console.log('✅ NEW SERVICE WALLET CREATED');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`Address: ${account.address}`);
  console.log(`Private Key: ${privateKey}`);
  console.log('───────────────────────────────────────────────────────────\n');

  // Check if wallet has any balance
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL),
  });

  try {
    const balance = await publicClient.getBalance({
      address: account.address,
    });

    console.log('💰 Current Balance:');
    console.log(`   ${formatEther(balance)} ETH\n`);

    if (balance === 0n) {
      console.log('⚠️  NOTE: This wallet has no ETH balance');
      console.log('   It will need a small amount of ETH for gas fees\n');
    }
  } catch (error) {
    console.log('ℹ️  Could not check balance (this is okay)\n');
  }

  // Instructions
  console.log('📋 NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('1️⃣  ADD TO YOUR .ENV FILE:');
  console.log('───────────────────────────────────────────────────────────');
  console.log('Add this line to your .env file:\n');
  console.log(`POD_ADMIN_PRIVATE_KEY=${privateKey}\n`);

  console.log('2️⃣  FUND THE WALLET:');
  console.log('───────────────────────────────────────────────────────────');
  console.log('Send a small amount of ETH to cover gas fees:\n');
  console.log(`Wallet Address: ${account.address}`);
  console.log('Recommended: 0.001 ETH (enough for ~100 transactions)\n');
  console.log('You can send from:');
  console.log('  - Your Coinbase wallet');
  console.log('  - Any exchange');
  console.log('  - Base faucet (if testnet)\n');

  console.log('3️⃣  MINT EXECUTIVE POD LEADER HAT:');
  console.log('───────────────────────────────────────────────────────────');
  console.log('Using your Coinbase Smart Wallet (current admin), mint');
  console.log('the Executive Pod Leader hat to this service wallet:\n');
  console.log(`Service Wallet: ${account.address}`);
  console.log(`Hat to Mint: Executive Pod Leader (EXECUTIVE_POD_LEADER_HAT_ID)\n`);
  console.log('You can do this via:');
  console.log('  a) Hats Protocol UI: https://app.hatsprotocol.xyz');
  console.log('  b) Your DAO multisig');
  console.log('  c) Direct contract interaction\n');

  console.log('4️⃣  VERIFY SETUP:');
  console.log('───────────────────────────────────────────────────────────');
  console.log('After minting the hat, run:\n');
  console.log('  tsx scripts/deploy/verify-admin-hat.ts\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('⚠️  SECURITY REMINDERS');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('• Store the private key ONLY in your .env file');
  console.log('• Add .env to .gitignore (should already be there)');
  console.log('• Never commit the private key to version control');
  console.log('• In production, use Vercel environment variables');
  console.log('• This wallet should ONLY be used for backend operations\n');

  console.log('═══════════════════════════════════════════════════════════\n');
}

generateServiceWallet();

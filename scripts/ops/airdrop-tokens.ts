/**
 * Manual Token Airdrop Script
 *
 * Use this to airdrop SELF and SYSTEM tokens to existing wallets
 * that completed onboarding before auto-airdrop was enabled.
 *
 * Usage:
 *   npx tsx scripts/ops/airdrop-tokens.ts <wallet_address>
 *
 * Example:
 *   npx tsx scripts/ops/airdrop-tokens.ts 0xYourWalletAddress
 */

import dotenv from 'dotenv';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseEther,
  formatEther,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// ============================================================
// Configuration
// ============================================================

const FAUCET_PRIVATE_KEY = process.env.TESTNET_FAUCET_PRIVATE_KEY || process.env.PRIVATE_KEY;
const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;
const CHAIN = base; // Base Mainnet
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

// Airdrop amounts (can be overridden via env)
const SYSTEM_AMOUNT = Number(process.env.NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SYSTEM) || 100;
const SELF_AMOUNT = Number(process.env.NEXT_PUBLIC_MAINNET_AIRDROP_AMOUNT_SELF) || 100;

// Supabase (for tracking airdrops)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ERC20 ABI
const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============================================================
// Helper Functions
// ============================================================

async function hasReceivedAirdrop(walletAddress: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('testnet_airdrops')
      .select('wallet_address')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking airdrop status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking airdrop status:', error);
    return false;
  }
}

async function recordAirdrop(
  walletAddress: string,
  systemAmount: bigint,
  selfAmount: bigint,
  txHash: string,
): Promise<void> {
  try {
    const { error } = await supabase.from('testnet_airdrops').insert({
      wallet_address: walletAddress.toLowerCase(),
      system_amount: systemAmount.toString(),
      self_amount: selfAmount.toString(),
      transaction_hash: txHash,
      airdropped_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error recording airdrop:', error);
    } else {
      console.log('✅ Airdrop recorded in database');
    }
  } catch (error) {
    console.error('Error recording airdrop:', error);
  }
}

async function transferToken(
  toAddress: string,
  tokenAddress: `0x${string}`,
  amount: bigint,
  tokenSymbol: string,
): Promise<string> {
  if (!FAUCET_PRIVATE_KEY) {
    throw new Error('Faucet private key not configured (TESTNET_FAUCET_PRIVATE_KEY or PRIVATE_KEY)');
  }

  const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: CHAIN,
    transport: http(RPC_URL),
  });

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(RPC_URL),
  });

  console.log(`📤 Transferring ${formatEther(amount)} ${tokenSymbol} to ${toAddress}...`);

  // Execute transfer
  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'transfer',
    args: [toAddress as `0x${string}`, amount],
  });

  console.log(`  ⏳ Transaction hash: ${hash}`);

  // Wait for confirmation
  await publicClient.waitForTransactionReceipt({ hash });

  console.log(`  ✅ ${tokenSymbol} transfer confirmed!`);

  return hash;
}

// ============================================================
// Main Airdrop Function
// ============================================================

async function airdropToWallet(walletAddress: string): Promise<void> {
  console.log('🚰 Manual Token Airdrop');
  console.log('='.repeat(50));
  console.log(`Target Wallet: ${walletAddress}`);
  console.log(`Network: ${CHAIN.name}`);
  console.log(`SYSTEM Amount: ${SYSTEM_AMOUNT}`);
  console.log(`SELF Amount: ${SELF_AMOUNT}`);
  console.log('='.repeat(50));

  // Validate address
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    throw new Error('Invalid Ethereum address format');
  }

  // Check if already received
  console.log('\n📋 Checking if wallet already received airdrop...');
  const alreadyReceived = await hasReceivedAirdrop(walletAddress);

  if (alreadyReceived) {
    console.log('⚠️  WARNING: This wallet already received an airdrop!');
    console.log('   Proceeding anyway (manual override)...\n');
  } else {
    console.log('✅ Wallet has not received airdrop yet\n');
  }

  // Transfer tokens
  const systemAmount = parseEther(SYSTEM_AMOUNT.toString());
  const selfAmount = parseEther(SELF_AMOUNT.toString());

  try {
    // Transfer SYSTEM tokens
    console.log('\n💰 Transferring SYSTEM tokens...');
    const systemTxHash = await transferToken(
      walletAddress,
      SYSTEM_TOKEN_ADDRESS,
      systemAmount,
      'SYSTEM',
    );

    // Transfer SELF tokens
    console.log('\n💰 Transferring SELF tokens...');
    const selfTxHash = await transferToken(
      walletAddress,
      SELF_TOKEN_ADDRESS,
      selfAmount,
      'SELF',
    );

    // Record airdrop (use SYSTEM tx hash as primary)
    console.log('\n📝 Recording airdrop in database...');
    await recordAirdrop(walletAddress, systemAmount, selfAmount, systemTxHash);

    console.log('\n' + '='.repeat(50));
    console.log('✅ AIRDROP SUCCESSFUL!');
    console.log('='.repeat(50));
    console.log(`SYSTEM: ${SYSTEM_AMOUNT} tokens (tx: ${systemTxHash})`);
    console.log(`SELF: ${SELF_AMOUNT} tokens (tx: ${selfTxHash})`);
    console.log(`To: ${walletAddress}`);
    console.log('='.repeat(50));
  } catch (error) {
    console.error('\n❌ Airdrop failed:', error);
    throw error;
  }
}

// ============================================================
// CLI Entry Point
// ============================================================

async function main() {
  const walletAddress = process.argv[2];

  if (!walletAddress) {
    console.error('❌ Error: Wallet address required');
    console.log('\nUsage:');
    console.log('  npx tsx scripts/ops/airdrop-tokens.ts <wallet_address>');
    console.log('\nExample:');
    console.log('  npx tsx scripts/ops/airdrop-tokens.ts 0xYourWalletAddress');
    process.exit(1);
  }

  try {
    await airdropToWallet(walletAddress);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();

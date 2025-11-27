/**
 * Beta Testing Auto-Airdrop System
 *
 * Automatically airdrops $SYSTEM and $SELF tokens to new users during 30-day beta
 * to make beta testing easier without requiring users to acquire tokens first.
 *
 * SECURITY: Only runs when NEXT_PUBLIC_ENABLE_BETA_AIRDROP=true
 * Can be used on mainnet or testnet depending on configuration
 */

import { createWalletClient, createPublicClient, http, parseEther, formatEther } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { getConfig, isTestnet, getAirdropConfig } from '@/config/testnetConfig';
import { supabase } from '@/lib/supabase';

// Determine which chain to use based on environment
const CHAIN = process.env.NEXT_PUBLIC_CHAIN_ID === '8453' ? base : baseSepolia;

// ============================================================
// Configuration
// ============================================================

const FAUCET_PRIVATE_KEY = process.env.TESTNET_FAUCET_PRIVATE_KEY || process.env.PRIVATE_KEY;
const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`;
const SELF_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

// ERC20 ABI for transfer function
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
// Airdrop Tracking (Database)
// ============================================================

interface AirdropRecord {
  wallet_address: string;
  system_amount: string;
  self_amount: string;
  airdropped_at: string;
  transaction_hash?: string;
}

/**
 * Check if wallet has already received airdrop
 */
async function hasReceivedAirdrop(walletAddress: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('testnet_airdrops')
      .select('wallet_address')
      .eq('wallet_address', walletAddress.toLowerCase())
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking airdrop status:', error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error('Error checking airdrop status:', error);
    return false;
  }
}

/**
 * Record airdrop in database
 */
async function recordAirdrop(
  walletAddress: string,
  systemAmount: bigint,
  selfAmount: bigint,
  txHash?: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('testnet_airdrops')
      .insert({
        wallet_address: walletAddress.toLowerCase(),
        system_amount: systemAmount.toString(),
        self_amount: selfAmount.toString(),
        transaction_hash: txHash,
        airdropped_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error recording airdrop:', error);
    }
  } catch (error) {
    console.error('Error recording airdrop:', error);
  }
}

// ============================================================
// Airdrop Functions
// ============================================================

/**
 * Transfer tokens from faucet to user
 */
async function transferTokens(
  toAddress: string,
  tokenAddress: `0x${string}`,
  amount: bigint,
  tokenSymbol: string
): Promise<string> {
  if (!FAUCET_PRIVATE_KEY) {
    throw new Error('Faucet private key not configured');
  }

  const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: CHAIN,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
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

/**
 * Check faucet balance before airdropping
 */
async function checkFaucetBalance(): Promise<boolean> {
  if (!FAUCET_PRIVATE_KEY) {
    console.error('❌ Faucet private key not configured');
    return false;
  }

  const account = privateKeyToAccount(FAUCET_PRIVATE_KEY as `0x${string}`);

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL),
  });

  try {
    // Check SYSTEM balance
    const systemBalance = await publicClient.readContract({
      address: SYSTEM_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });

    // Check SELF balance
    const selfBalance = await publicClient.readContract({
      address: SELF_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });

    const config = getAirdropConfig();
    if (!config) return false;

    const hasEnoughSystem = systemBalance >= config.amounts.system;
    const hasEnoughSelf = selfBalance >= config.amounts.self;

    if (!hasEnoughSystem || !hasEnoughSelf) {
      console.warn('⚠️ Faucet balance low:');
      console.warn(`   SYSTEM: ${formatEther(systemBalance)} (need ${formatEther(config.amounts.system)})`);
      console.warn(`   SELF: ${formatEther(selfBalance)} (need ${formatEther(config.amounts.self)})`);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking faucet balance:', error);
    return false;
  }
}

// ============================================================
// Main Airdrop Function
// ============================================================

export interface AirdropResult {
  success: boolean;
  systemAmount?: bigint;
  selfAmount?: bigint;
  transactionHash?: string;
  error?: string;
  alreadyReceived?: boolean;
}

/**
 * Airdrop test tokens to a new user
 *
 * @param walletAddress - User's wallet address
 * @returns Airdrop result with success status and details
 */
export async function airdropToUser(walletAddress: string): Promise<AirdropResult> {
  // SECURITY: Only run on testnet
  if (!isTestnet()) {
    console.warn('❌ Airdrop attempted on mainnet - BLOCKED');
    return {
      success: false,
      error: 'Airdrop only available on testnet',
    };
  }

  // Check if auto-airdrop is enabled
  const airdropConfig = getAirdropConfig();
  if (!airdropConfig) {
    return {
      success: false,
      error: 'Auto-airdrop not enabled',
    };
  }

  try {
    console.log(`🚰 Starting airdrop for ${walletAddress}...`);

    // Check if already received airdrop
    const alreadyAirdropped = await hasReceivedAirdrop(walletAddress);
    if (alreadyAirdropped) {
      console.log(`  ℹ️ User already received airdrop`);
      return {
        success: false,
        alreadyReceived: true,
        error: 'You have already received your testnet airdrop',
      };
    }

    // Check faucet balance
    const hasSufficientBalance = await checkFaucetBalance();
    if (!hasSufficientBalance) {
      return {
        success: false,
        error: 'Faucet balance too low. Please contact support.',
      };
    }

    // Transfer SYSTEM tokens
    const systemTxHash = await transferTokens(
      walletAddress,
      SYSTEM_TOKEN_ADDRESS,
      airdropConfig.amounts.system,
      'SYSTEM'
    );

    // Transfer SELF tokens
    const selfTxHash = await transferTokens(
      walletAddress,
      SELF_TOKEN_ADDRESS,
      airdropConfig.amounts.self,
      'SELF'
    );

    // Record airdrop in database
    await recordAirdrop(
      walletAddress,
      airdropConfig.amounts.system,
      airdropConfig.amounts.self,
      systemTxHash
    );

    console.log(`✅ Airdrop complete for ${walletAddress}`);
    console.log(`   SYSTEM: ${formatEther(airdropConfig.amounts.system)}`);
    console.log(`   SELF: ${formatEther(airdropConfig.amounts.self)}`);

    return {
      success: true,
      systemAmount: airdropConfig.amounts.system,
      selfAmount: airdropConfig.amounts.self,
      transactionHash: systemTxHash,
    };
  } catch (error) {
    console.error('❌ Airdrop failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Airdrop failed',
    };
  }
}

/**
 * Get airdrop status for a wallet
 */
export async function getAirdropStatus(walletAddress: string): Promise<{
  eligible: boolean;
  alreadyReceived: boolean;
  amounts?: {
    system: bigint;
    self: bigint;
  };
}> {
  if (!isTestnet()) {
    return { eligible: false, alreadyReceived: false };
  }

  const airdropConfig = getAirdropConfig();
  if (!airdropConfig) {
    return { eligible: false, alreadyReceived: false };
  }

  const alreadyReceived = await hasReceivedAirdrop(walletAddress);

  return {
    eligible: !alreadyReceived,
    alreadyReceived,
    amounts: airdropConfig.amounts,
  };
}

// ============================================================
// React Hook for Airdrop
// ============================================================

/**
 * Hook to handle automatic airdrop on wallet connection
 * Usage in your app:
 *
 * ```tsx
 * import { useTestnetAirdrop } from '@/utils/testnetAirdrop';
 *
 * function MyComponent() {
 *   const { address } = useAccount();
 *   useTestnetAirdrop(address);
 * }
 * ```
 */
export function useTestnetAirdrop(walletAddress?: string) {
  const [airdropping, setAirdropping] = React.useState(false);
  const [result, setResult] = React.useState<AirdropResult | null>(null);

  React.useEffect(() => {
    if (!walletAddress || !isTestnet()) return;

    const performAirdrop = async () => {
      setAirdropping(true);

      try {
        const airdropResult = await airdropToUser(walletAddress);
        setResult(airdropResult);

        if (airdropResult.success) {
          console.log('🎉 Welcome bonus received!');
        }
      } catch (error) {
        console.error('Airdrop error:', error);
        setResult({
          success: false,
          error: 'Failed to receive welcome bonus',
        });
      } finally {
        setAirdropping(false);
      }
    };

    performAirdrop();
  }, [walletAddress]);

  return {
    airdropping,
    result,
  };
}

// Import React for the hook
import React from 'react';

// ============================================================
// Database Migration (Run Once)
// ============================================================

/**
 * SQL to create testnet_airdrops table
 * Run this in Supabase SQL editor:
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS testnet_airdrops (
 *   id BIGSERIAL PRIMARY KEY,
 *   wallet_address TEXT NOT NULL UNIQUE,
 *   system_amount TEXT NOT NULL,
 *   self_amount TEXT NOT NULL,
 *   transaction_hash TEXT,
 *   airdropped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 *
 * CREATE INDEX idx_testnet_airdrops_wallet ON testnet_airdrops(wallet_address);
 * CREATE INDEX idx_testnet_airdrops_created ON testnet_airdrops(created_at);
 *
 * -- Enable Row Level Security
 * ALTER TABLE testnet_airdrops ENABLE ROW LEVEL SECURITY;
 *
 * -- Allow public read access (to check if address already received airdrop)
 * CREATE POLICY "Allow public read access to airdrops"
 *   ON testnet_airdrops FOR SELECT
 *   USING (true);
 *
 * -- Allow insert only from service role (backend)
 * CREATE POLICY "Allow service role to insert airdrops"
 *   ON testnet_airdrops FOR INSERT
 *   WITH CHECK (true);
 * ```
 */

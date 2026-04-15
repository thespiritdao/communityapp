// src/config/wagmi.client.ts
'use client';

import { http, createConfig, fallback } from 'wagmi';
import { createPublicClient } from 'viem';
import { base } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

// Builder Code attribution suffix (ERC-8021) — appended to all wagmi-routed transactions
const BUILDER_CODE_SUFFIX = '0x62635f6871796d636778730b0080218021802180218021802180218021' as `0x${string}`;

// Multiple RPC providers for redundancy and rate limit handling
const PRIMARY_RPC = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';
const FALLBACK_RPCS = [
  'https://mainnet.base.org', // Base's official public RPC (free, no rate limits)
  'https://base.llamarpc.com', // LlamaNodes public RPC
  'https://base.meowrpc.com', // Meow RPC
];

console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  primaryRPC: PRIMARY_RPC,
  fallbackCount: FALLBACK_RPCS.length,
  usingCDP: true,
});

/**
 * Wagmi config with Coinbase Wallet connector for OnchainKit compatibility
 *
 * UPDATED: Added coinbaseWallet connector to enable OnchainKit Transaction components.
 * This creates a bridge between CDP Embedded Wallets and OnchainKit's transaction flow.
 *
 * UPDATED: Added fallback RPC providers to handle rate limiting gracefully.
 * If the primary RPC (Infura) hits rate limits, it automatically falls back to:
 * 1. Base's official public RPC (no rate limits)
 * 2. LlamaNodes public RPC
 * 3. Meow RPC
 *
 * For transactions with CDP wallets:
 *   ✅ Use OnchainKit <Transaction> components (now supported via connector)
 *   ✅ Use TransactionButton for user-friendly transaction flow
 *   ✅ Paymaster integration handled by OnchainKitProvider
 *
 * This wagmi config provides:
 * - Contract reads (publicClient.readContract)
 * - Chain data queries
 * - Wallet client for transaction signing (via coinbaseWallet connector)
 * - Automatic fallback on rate limit errors (429)
 */
export const wagmiConfig = createConfig({
  chains: [base],
  dataSuffix: BUILDER_CODE_SUFFIX,
  transports: {
    [base.id]: fallback([
      http(PRIMARY_RPC, {
        retryCount: 3,
        retryDelay: 1000,
      }),
      ...FALLBACK_RPCS.map((url) => http(url, {
        retryCount: 2,
        retryDelay: 500,
      })),
    ]),
  },
  connectors: [
    coinbaseWallet({
      appName: 'SpiritDAO',
      preference: 'smartWalletOnly', // Critical: Use Smart Wallet for CDP compatibility
      version: '4',
    }),
  ],
  ssr: true,
});

/**
 * Public client for read-only blockchain interactions
 * Used by pods features and other services for contract reads
 *
 * Now uses fallback transport to handle rate limiting automatically
 */
export const publicClient = createPublicClient({
  chain: base,
  transport: fallback([
    http(PRIMARY_RPC, {
      retryCount: 3,
      retryDelay: 1000,
    }),
    ...FALLBACK_RPCS.map((url) => http(url, {
      retryCount: 2,
      retryDelay: 500,
    })),
  ]),
});

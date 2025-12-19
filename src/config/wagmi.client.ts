// src/config/wagmi.client.ts
'use client';

import { http, createConfig } from 'wagmi';
import { createPublicClient } from 'viem';
import { base } from 'wagmi/chains';

// Use standard Base RPC, NOT CDP endpoints
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: true,
  fallbackRPC: !Boolean(process.env.NEXT_PUBLIC_RPC_URL),
});

/**
 * Wagmi config for READ-ONLY blockchain operations
 *
 * CRITICAL: CDP Embedded Wallets authenticate via CDPHooksProvider, NOT wagmi connectors.
 * Using connectors creates a separate wallet system that conflicts with CDP authentication.
 *
 * For transactions with CDP wallets:
 *   ✅ Use useSendEvmTransaction() from CDP hooks
 *   ✅ Use custom paymaster integration for gas sponsorship
 *   ❌ NOT OnchainKit <TransactionButton> (requires wagmi connector)
 *
 * This wagmi config is ONLY for:
 * - Contract reads (publicClient.readContract)
 * - Chain data queries
 * - NOT for wallet connection or transactions
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [], // NO connectors - CDP wallet managed by CDPHooksProvider
  ssr: true,
});

/**
 * Public client for read-only blockchain interactions
 * Used by pods features and other services for contract reads
 */
export const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
});

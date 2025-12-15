// src/config/wagmi.client.ts
'use client';

import { http, createConfig } from 'wagmi';
import { createPublicClient } from 'viem';
import { base } from 'wagmi/chains';

// Use standard Base RPC, NOT CDP endpoints
// CDP wallet functionality is handled entirely by CDPHooksProvider
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: true, // CDP managed by CDPHooksProvider, OnchainKit detects automatically
  fallbackRPC: !Boolean(process.env.NEXT_PUBLIC_RPC_URL),
});

/**
 * Wagmi config for OnchainKit compatibility
 *
 * IMPORTANT: OnchainKit Transaction components detect CDP wallets automatically
 * when wrapped in CDPHooksProvider. No connector needed.
 *
 * Architecture:
 * - CDPHooksProvider wraps app (in layout.tsx)
 * - OnchainKit Transaction detects CDP wallet from context
 * - Wagmi config provides chain/transport info only
 * - CDP hooks (useEvmAddress, useCurrentUser) are primary wallet API
 *
 * Note: @coinbase/cdp-wagmi v0.0.73 exports createCDPEmbeddedWalletConnector
 * but it requires complex config. OnchainKit works without it via CDPHooksProvider.
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [], // OnchainKit detects CDP wallets via CDPHooksProvider context
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

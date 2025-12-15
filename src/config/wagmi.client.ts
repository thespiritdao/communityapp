// src/config/wagmi.client.ts
'use client';

import { http, createConfig } from 'wagmi';
import { createPublicClient } from 'viem';
import { base } from 'wagmi/chains';
import { cdpConnector } from '@coinbase/cdp-wagmi';

// Use standard Base RPC, NOT CDP endpoints
// CDP wallet functionality is handled entirely by CDPReactProvider
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: true, // CDP connector bridges embedded wallets to wagmi
  fallbackRPC: !Boolean(process.env.NEXT_PUBLIC_RPC_URL),
});

/**
 * Wagmi config with CDP connector bridge
 *
 * IMPORTANT: OnchainKit Transaction components use wagmi hooks internally (useAccount).
 * The cdpConnector bridges CDP embedded wallets to wagmi's account context.
 *
 * Architecture:
 * - CDPHooksProvider manages wallet auth (email/social login)
 * - cdpConnector exposes wallet to wagmi hooks
 * - OnchainKit Transaction components work seamlessly with CDP wallets
 * - CDP hooks (useEvmAddress, useCurrentUser) still work as primary API
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [
    cdpConnector({
      // CDP embedded wallets auto-detected via CDPHooksProvider
      appName: 'SpiritDAO',
      appLogoUrl: '/spiritdaosymbol.png',
    }),
  ],
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

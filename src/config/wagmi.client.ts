// src/config/wagmi.client.ts
'use client';

import { http, createConfig } from 'wagmi';
import { createPublicClient } from 'viem';
import { base } from 'wagmi/chains';
import { createCDPEmbeddedWalletConnector } from '@coinbase/cdp-wagmi';

// Use standard Base RPC, NOT CDP endpoints
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: true,
  fallbackRPC: !Boolean(process.env.NEXT_PUBLIC_RPC_URL),
});

/**
 * CRITICAL FIX: CDP-Wagmi Connector Bridge
 *
 * This connector bridges CDP embedded wallets (OAuth login) to wagmi's ecosystem.
 * Without this connector:
 * - CDP hooks (useEvmAddress) can see the wallet ✅
 * - Wagmi hooks (useAccount) cannot see the wallet ❌
 * - OnchainKit Transaction (uses wagmi internally) fails ❌
 *
 * With this connector:
 * - CDP wallet becomes visible to wagmi's useAccount()
 * - OnchainKit Transaction components work
 * - All wagmi-based functionality works
 *
 * Architecture:
 * - User logs in via CDP (email/Google/social)
 * - CDP creates embedded wallet
 * - This connector makes that wallet available to wagmi
 * - OnchainKit Transaction detects wallet via wagmi.useAccount()
 */
const cdpConnector = createCDPEmbeddedWalletConnector({
  cdpConfig: {
    projectId: process.env.NEXT_PUBLIC_CDP_PROJECT_ID!,
  },
  providerConfig: {
    chains: [base],
    transports: {
      [base.id]: http(RPC_URL),
    },
  },
});

export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [cdpConnector], // ← CRITICAL: Bridges CDP wallet to wagmi
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

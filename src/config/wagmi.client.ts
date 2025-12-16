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
 * Wagmi config for read-only operations
 *
 * IMPORTANT: CDP embedded wallets are managed by CDPHooksProvider.
 * Transactions use CDP's useSendEvmTransaction, NOT wagmi.
 *
 * Why no connector:
 * - createCDPEmbeddedWalletConnector creates a NEW wallet (different from login)
 * - CDP session wallet: 0xAECF4D00F0e402FbeB0757f22be9062d89018106
 * - Connector wallet: 0x5fe9c0e4B69f24857A2670b55FDE613F5dd139b7 (WRONG!)
 * - Transactions must use the SAME wallet as login
 *
 * Architecture:
 * - Login via CDPHooksProvider → creates wallet
 * - Transactions via useSendEvmTransaction → uses SAME wallet
 * - Paymaster configured in CDPEmbeddedProvider
 * - Wagmi only for read operations (publicClient)
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [], // CDP wallet NOT compatible with wagmi connectors
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

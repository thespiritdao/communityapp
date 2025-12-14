// src/config/wagmi.client.ts
'use client';

import { http, createConfig } from 'wagmi';
import { base } from 'wagmi/chains';

// Use standard Base RPC, NOT CDP endpoints
// CDP wallet functionality is handled entirely by CDPReactProvider
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org';

console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: false, // CDP is separate from wagmi
  fallbackRPC: !Boolean(process.env.NEXT_PUBLIC_RPC_URL),
});

/**
 * Wagmi config for generic blockchain interactions
 *
 * NOTE: CDP embedded wallets are NOT integrated with wagmi in this app.
 * Use CDP hooks directly: useEvmAddress(), useCurrentUser(), etc.
 *
 * Wagmi is kept for:
 * 1. Generic viem client usage
 * 2. OnchainKit compatibility (OnchainKit uses wagmi context internally)
 * 3. Potential future external wallet support
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL),
  },
  connectors: [], // CDP wallets managed separately via CDPReactProvider
  ssr: true,
});

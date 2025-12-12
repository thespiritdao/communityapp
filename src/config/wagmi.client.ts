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
  usingCDP: false, // ✅ MUST be false - CDP is handled by CDPReactProvider
  fallbackRPC: !Boolean(process.env.NEXT_PUBLIC_RPC_URL),
});

/**
 * Wagmi config WITHOUT any CDP integration
 *
 * CRITICAL: This config must NOT initialize CDP in any way.
 * CDP wallet management is handled entirely by CDPReactProvider in CDPEmbeddedProvider.tsx
 *
 * This wagmi instance is kept ONLY for:
 * 1. Non-CDP wallet connectors (if needed in future)
 * 2. Generic viem client usage
 * 3. OnchainKit compatibility (OnchainKit uses wagmi context but CDP handles wallets)
 */
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(RPC_URL), // ✅ Standard Base RPC, not CDP endpoints
  },
  connectors: [], // ✅ Empty - CDP wallets managed by CDPReactProvider only
  ssr: true,
});

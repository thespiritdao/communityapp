// src/config/wagmi.client.ts
import { http, createConfig } from 'wagmi';
import { createPublicClient } from 'viem';
import { base, baseSepolia } from 'wagmi/chains';

// Log RPC configuration for debugging
console.log('🔗 Wagmi RPC Configuration:', {
  hasApiKey: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  hasCustomRPC: Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  usingCDP: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  fallbackRPC:
    !process.env.NEXT_PUBLIC_CDP_API_CLIENT && !process.env.NEXT_PUBLIC_RPC_URL,
});

// Create transports for each chain
// IMPORTANT: Added explicit timeouts for Firefox compatibility
// Firefox has stricter default timeouts (~90s) compared to Chrome (~300s)
const transportConfig = {
  timeout: 60_000, // 60 seconds - works for both Firefox and Chrome
  retryCount: 3,   // Retry failed requests up to 3 times
  retryDelay: 150, // 150ms delay between retries
};

const getBaseTransport = () => {
  if (process.env.NEXT_PUBLIC_CDP_API_CLIENT) {
    return http(
      `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      transportConfig
    );
  }
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return http(process.env.NEXT_PUBLIC_RPC_URL, transportConfig);
  }
  return http(undefined, transportConfig);
};

const getBaseSepoliaTransport = () => {
  if (process.env.NEXT_PUBLIC_CDP_API_CLIENT) {
    return http(
      `https://api.developer.coinbase.com/rpc/v1/base-sepolia/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      transportConfig
    );
  }
  return http(undefined, transportConfig);
};

// Wagmi config WITHOUT CDP connector
// CDP wallet management is handled entirely by CDPReactProvider in CDPEmbeddedProvider.tsx
// This wagmi instance is kept for:
// 1. Non-CDP wallet connectors (if needed in future)
// 2. Generic viem client usage
// 3. OnchainKit compatibility
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [], // Empty - CDP wallets managed by CDPReactProvider
  transports: {
    [base.id]: getBaseTransport(),
    [baseSepolia.id]: getBaseSepoliaTransport(),
  },
  ssr: true, // Enable SSR support
});

// Create public client for contract reads
export const publicClient = createPublicClient({
  chain: base,
  transport: process.env.NEXT_PUBLIC_CDP_API_CLIENT
    ? http(
        `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      )
    : process.env.NEXT_PUBLIC_RPC_URL
      ? http(process.env.NEXT_PUBLIC_RPC_URL)
      : http(), // fallback to default if no API key or RPC URL
});

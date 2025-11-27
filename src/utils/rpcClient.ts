/**
 * Centralized RPC Client Configuration
 *
 * Provides consistent RPC endpoints across all services to avoid Infura rate limiting.
 * Uses your configured CDP API or custom RPC URLs.
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

/**
 * Get the appropriate transport for the given chain
 */
function getTransport(chainId: number) {
  // Use CDP API if available
  if (process.env.NEXT_PUBLIC_CDP_API_CLIENT) {
    if (chainId === base.id) {
      return http(
        `https://api.developer.coinbase.com/rpc/v1/base/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      );
    } else if (chainId === baseSepolia.id) {
      return http(
        `https://api.developer.coinbase.com/rpc/v1/base-sepolia/${process.env.NEXT_PUBLIC_CDP_API_CLIENT}`,
      );
    }
  }

  // Use custom RPC URL if provided
  if (process.env.NEXT_PUBLIC_RPC_URL) {
    return http(process.env.NEXT_PUBLIC_RPC_URL);
  }

  // Fallback to chain's default public RPC (avoids Infura)
  if (chainId === base.id) {
    return http('https://mainnet.base.org');
  }

  // Final fallback to viem's defaults (which use public RPCs, not Infura)
  return http();
}

/**
 * Creates a public client using the configured RPC endpoints
 */
export function createConfiguredPublicClient(chainId: number = base.id) {
  const chain = chainId === baseSepolia.id ? baseSepolia : base;

  return createPublicClient({
    chain,
    transport: getTransport(chainId),
  });
}

/**
 * Creates a wallet client using the configured RPC endpoints
 */
export function createConfiguredWalletClient(chainId: number = base.id) {
  const chain = chainId === baseSepolia.id ? baseSepolia : base;

  return createWalletClient({
    chain,
    transport: getTransport(chainId),
  });
}

/**
 * Pre-configured Base mainnet public client
 */
export const basePublicClient = createConfiguredPublicClient(base.id);

/**
 * Pre-configured Base Sepolia public client
 */
export const baseSepoliaPublicClient = createConfiguredPublicClient(
  baseSepolia.id,
);

/**
 * Logs current RPC configuration for debugging
 */
export function logRpcConfiguration() {
  console.group('🔗 RPC Configuration');
  console.log(
    'CDP API Available:',
    Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  );
  console.log(
    'Custom RPC Available:',
    Boolean(process.env.NEXT_PUBLIC_RPC_URL),
  );
  console.log(
    'Using CDP API:',
    Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
  );
  console.log(
    'Using Custom RPC:',
    Boolean(
      process.env.NEXT_PUBLIC_RPC_URL &&
        !process.env.NEXT_PUBLIC_CDP_API_CLIENT,
    ),
  );
  console.log(
    'Using Base Public RPC:',
    !process.env.NEXT_PUBLIC_CDP_API_CLIENT && !process.env.NEXT_PUBLIC_RPC_URL,
  );
  console.groupEnd();
}

// src/providers/CDPEmbeddedProvider.tsx
'use client';
import { APP_NAME } from '@/config/deployment';

import type { ReactNode } from 'react';
import { CDPHooksProvider } from '@coinbase/cdp-hooks';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { validateContractAddresses } from '@/config/contracts';
import { wagmiConfig } from '@/config/wagmi.client';
import { base } from 'wagmi/chains';

// Create the QueryClient instance outside component with conservative defaults
// to prevent excessive RPC calls and rate limiting
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Increase stale time to reduce refetching
      staleTime: 5 * 60 * 1000, // 5 minutes (up from default 0)
      // Reduce automatic background refetching
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      refetchOnMount: false, // Don't refetch when component mounts if data exists
      refetchOnReconnect: false, // Don't refetch when reconnecting
      // Retry configuration for rate limits
      retry: (failureCount, error: any) => {
        // Don't retry on rate limit errors (429)
        if (error?.status === 429 || error?.message?.includes('Too Many Requests')) {
          console.warn('⚠️ Rate limit detected, not retrying');
          return false;
        }
        // Retry other errors up to 2 times
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

interface CDPEmbeddedProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app with Coinbase CDP Embedded Wallets provider + Wagmi for backwards compatibility.
 *
 * CRITICAL: Uses CDPHooksProvider (not CDPReactProvider) to properly manage
 * embedded wallet authentication state and prevent session loss during navigation.
 *
 * This hybrid approach allows:
 * - New code to use embedded wallets (email/social login, no popups)
 * - Existing code using wagmi hooks to continue working
 *
 * Embedded wallets:
 * - Use email/social login (no external wallet app needed)
 * - Work entirely in-app (no OAuth popups)
 * - Are mobile-first by design
 * - Private keys managed by Coinbase infrastructure
 * - Session persists across navigation via CDPHooksProvider
 *
 * @see https://docs.base.org/base-account/framework-integrations/cdp
 */
// REMOVED: Stale session checking was interfering with CDP's session restoration
// The CDP SDK handles session persistence internally via localStorage
// Hard refreshes work fine as long as we don't clear/modify localStorage

export function CDPEmbeddedProvider({ children }: CDPEmbeddedProviderProps) {
  // No session checking - let CDP SDK handle its own persistence

  // DISABLED: This error handler was logging users out
  // The CDP SDK 400 errors are cosmetic - clearing localStorage breaks sessions
  // Leaving this commented for reference - DO NOT RE-ENABLE
  /*
  useEffect(() => {
    const handleCDPError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = 'reason' in event ? event.reason : event.error;
      const errorMessage = error?.message || error?.toString() || '';

      if (
        errorMessage.includes('auth/refresh') ||
        errorMessage.includes('auth/logout') ||
        (errorMessage.includes('400') && errorMessage.includes('cdp.coinbase.com'))
      ) {
        // ❌ DO NOT CLEAR LOCALSTORAGE - THIS LOGS USERS OUT
        // The CDP SDK handles retries internally
        console.warn('⚠️ CDP auth error detected (cosmetic - not clearing session)');

        if ('preventDefault' in event) {
          event.preventDefault();
        }
      }
    };

    window.addEventListener('error', handleCDPError);
    window.addEventListener('unhandledrejection', handleCDPError);

    return () => {
      window.removeEventListener('error', handleCDPError);
      window.removeEventListener('unhandledrejection', handleCDPError);
    };
  }, []);
  */

  // Validate contract addresses on mount
  useEffect(() => {
    const validation = validateContractAddresses();

    if (!validation.isValid) {
      console.error('❌ MISSING REQUIRED CONTRACT ADDRESSES:');
      validation.missing.forEach((addr) => {
        console.error(`  - ${addr}`);
      });
      console.error(
        '\n⚠️ Application features will fail until these are configured in .env',
      );
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️ CONTRACT CONFIGURATION WARNINGS:');
      validation.warnings.forEach((warning) => {
        console.warn(`  - ${warning}`);
      });
    }

    if (validation.isValid && validation.warnings.length === 0) {
      console.log('✅ All critical contract addresses configured');
    }
  }, []);

  // Validate CDP Project ID
  const projectId = process.env.NEXT_PUBLIC_CDP_PROJECT_ID;

  if (!projectId) {
    console.error('❌ NEXT_PUBLIC_CDP_PROJECT_ID is not configured in .env');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h2>
          <p className="text-gray-600 mb-4">
            CDP Project ID is missing. Please add NEXT_PUBLIC_CDP_PROJECT_ID to your .env file.
          </p>
          <p className="text-sm text-gray-500">
            Get your Project ID from: https://portal.cdp.coinbase.com/
          </p>
        </div>
      </div>
    );
  }

  console.log('🔐 CDP Embedded Wallets: Initializing with CDPHooksProvider for session persistence');
  console.log('   Project ID:', projectId.substring(0, 8) + '...');

  // CDP Hooks Provider config - Critical for session persistence!
  // See: https://docs.base.org/base-account/framework-integrations/cdp
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  const cdpConfig = useMemo(
    () => ({
      projectId,
      ethereum: {
        createOnLogin: 'smart' as const, // Create Smart Wallet on login (embedded)
        networks: [
          {
            chainId: base.id, // Base Mainnet (8453) - hardcoded for reliability
            rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || base.rpcUrls.default.http[0],
            // ✅ CRITICAL: Paymaster must be configured here for useSendUserOperation to sponsor gas
            paymasterUrl: paymasterEndpoint,
          },
        ],
      },
      appName: APP_NAME,
      appLogoUrl: '/spiritdaosymbol.png',
    }),
    [projectId, paymasterEndpoint],
  );

  if (!paymasterEndpoint) {
    console.warn(
      '⚠️ PAYMASTER NOT CONFIGURED - Users will need to pay gas fees!',
    );
    console.warn(
      '   Set NEXT_PUBLIC_PAYMASTER in .env to enable sponsored transactions',
    );
  } else {
    console.log('✅ Paymaster configured for gasless transactions');
    console.log('   Endpoint:', paymasterEndpoint.substring(0, 50) + '...');
  }

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <CDPHooksProvider config={cdpConfig}>
          {children}
        </CDPHooksProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// src/wallet/components/CDPEmbeddedProvider.tsx
'use client';

import type { ReactNode } from 'react';
import { CDPHooksProvider } from '@coinbase/cdp-hooks';
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { validateContractAddresses } from '@/config/contracts';
import { wagmiConfig } from '@/config/wagmi.client';
import { base } from 'wagmi/chains';
import { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL } from '@/constants';

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
// Global flag to ensure session check runs only once per page load
let hasCheckedSession = false;

export function CDPEmbeddedProvider({ children }: CDPEmbeddedProviderProps) {
  // CRITICAL: Check for and clear stale CDP sessions BEFORE initialization
  // This runs synchronously before React renders children - BUT ONLY ONCE
  if (typeof window !== 'undefined' && !hasCheckedSession) {
    hasCheckedSession = true; // Set flag immediately to prevent re-runs

    try {
      const storageKeys = Object.keys(localStorage);
      const cdpAuthKeys = storageKeys.filter(key =>
        (key.includes('cdp') || key.includes('coinbase')) &&
        (key.includes('token') || key.includes('refresh') || key.includes('session'))
      );

      // Check if any CDP auth keys exist
      if (cdpAuthKeys.length > 0) {
        // Check if the last session refresh was recent (within 24 hours)
        const lastRefreshKey = 'cdp_last_refresh';
        const lastRefresh = localStorage.getItem(lastRefreshKey);
        const now = Date.now();

        // ONLY clear if we have a timestamp AND it's stale
        // If no timestamp, create one (assume fresh login)
        if (lastRefresh && (now - parseInt(lastRefresh)) > 24 * 60 * 60 * 1000) {
          console.warn('⚠️ Detected stale CDP session (>24h old), clearing...');
          cdpAuthKeys.forEach(key => {
            console.log(`🗑️ Removing stale CDP key: ${key}`);
            localStorage.removeItem(key);
          });
          localStorage.removeItem(lastRefreshKey);
        } else {
          // Set or update timestamp for valid session
          localStorage.setItem(lastRefreshKey, now.toString());
        }
      }
    } catch (error) {
      console.error('Error checking CDP session age:', error);
    }
  }

  // Handle CDP session refresh failures
  useEffect(() => {
    const handleCDPError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const error = 'reason' in event ? event.reason : event.error;
      const errorMessage = error?.message || error?.toString() || '';

      // Detect CDP refresh failures
      if (
        errorMessage.includes('auth/refresh') ||
        errorMessage.includes('auth/logout') ||
        (errorMessage.includes('400') && errorMessage.includes('cdp.coinbase.com'))
      ) {
        console.warn('⚠️ CDP session refresh failed, clearing stale session data...');

        try {
          // Clear CDP-related localStorage entries
          const storageKeys = Object.keys(localStorage);
          const cdpKeys = storageKeys.filter(key =>
            key.toLowerCase().includes('cdp') ||
            key.toLowerCase().includes('coinbase') ||
            key.toLowerCase().includes('embedded') ||
            key.toLowerCase().includes('wallet')
          );

          cdpKeys.forEach(key => {
            console.log(`🗑️ Removing stale CDP key: ${key}`);
            localStorage.removeItem(key);
          });

          // Don't reload immediately - let the app continue with a fresh session
          console.log('✅ Stale CDP session cleared. Please reconnect your wallet.');
        } catch (clearError) {
          console.error('Failed to clear CDP session:', clearError);
        }

        // Prevent the error from propagating and causing a crash
        if ('preventDefault' in event) {
          event.preventDefault();
        }
      }
    };

    // Listen for both synchronous and async errors
    window.addEventListener('error', handleCDPError);
    window.addEventListener('unhandledrejection', handleCDPError);

    return () => {
      window.removeEventListener('error', handleCDPError);
      window.removeEventListener('unhandledrejection', handleCDPError);
    };
  }, []);

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
      appName: 'SpiritDAO',
      appLogoUrl: '/spiritdaosymbol.png',
    }),
    [projectId, paymasterEndpoint],
  );

  // OnchainKit config - Paymaster for gasless transactions (using same endpoint as CDP)
  const onchainKitConfig = useMemo(
    () => ({
      appearance: {
        name: 'SpiritDAO',
        logo: '/spiritdaosymbol.png',
        mode: 'auto' as const,
        theme: 'minimal' as const,
      },
      wallet: {
        display: 'modal' as const,
        termsUrl: DEFAULT_TERMS_URL,
        privacyUrl: DEFAULT_PRIVACY_URL,
      },
      paymaster: paymasterEndpoint,
    }),
    [paymasterEndpoint],
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
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT!}
          chain={base}
          config={onchainKitConfig}
        >
          <CDPHooksProvider config={cdpConfig}>
            {children}
          </CDPHooksProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

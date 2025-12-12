// src/wallet/components/CDPEmbeddedProvider.tsx
'use client';

import type { ReactNode } from 'react';
import { CDPReactProvider } from '@coinbase/cdp-react';
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { validateContractAddresses } from '@/config/contracts';
import { wagmiConfig } from '@/config/wagmi.client';
import { base } from 'wagmi/chains';
import { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL } from '@/constants';

// Create the QueryClient instance outside component
const queryClient = new QueryClient();

interface CDPEmbeddedProviderProps {
  children: ReactNode;
}

/**
 * Wraps the app with Coinbase CDP Embedded Wallets provider + Wagmi for backwards compatibility.
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
 */
export function CDPEmbeddedProvider({ children }: CDPEmbeddedProviderProps) {
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

  console.log('🔐 CDP Embedded Wallets: Initializing with Project ID:', projectId.substring(0, 8) + '...');

  // CDP React Provider config
  const cdpConfig = useMemo(
    () => ({
      projectId,
      ethereum: {
        createOnLogin: 'smart' as const, // Create Smart Wallet on login (embedded)
        networks: [
          {
            chainId: parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '8453', 10),
            rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org',
          },
        ],
      },
      appName: 'SpiritDAO',
      appLogoUrl: '/spiritdaosymbol.png',
    }),
    [projectId],
  );

  // OnchainKit config
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
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
      '⚠️ Paymaster endpoint not configured. Transactions will not be sponsored.',
    );
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT!}
          chain={base}
          config={onchainKitConfig}
        >
          <CDPReactProvider config={cdpConfig}>
            {children}
          </CDPReactProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

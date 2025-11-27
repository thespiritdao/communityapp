// src/wallet/components/OnchainProviders.tsx
'use client';

import type { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base } from 'wagmi/chains';
import { wagmiConfig } from '../../config/wagmi.client';
import { useMemo, useEffect } from 'react';
import { validateContractAddresses } from '@/config/contracts';
import { DEFAULT_PRIVACY_URL, DEFAULT_TERMS_URL } from '@/constants';

// Create the QueryClient instance outside component
const queryClient = new QueryClient();

interface OnchainProvidersProps {
  children: ReactNode;
}

/**
 * Wraps the app with Wagmi, React Query, and OnchainKit contexts.
 */
export function OnchainProviders({ children }: OnchainProvidersProps) {
  // Validate contract addresses on mount
  useEffect(() => {
    const validation = validateContractAddresses();

    if (!validation.isValid) {
      console.error('❌ MISSING REQUIRED CONTRACT ADDRESSES:');
      validation.missing.forEach(addr => {
        console.error(`  - ${addr}`);
      });
      console.error('\n⚠️ Application features will fail until these are configured in .env');
    }

    if (validation.warnings.length > 0) {
      console.warn('⚠️ CONTRACT CONFIGURATION WARNINGS:');
      validation.warnings.forEach(warning => {
        console.warn(`  - ${warning}`);
      });
    }

    if (validation.isValid && validation.warnings.length === 0) {
      console.log('✅ All critical contract addresses configured');
    }
  }, []);

  // Validate paymaster configuration
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;

  // Memoize the OnchainKit config to prevent re-renders
  const onchainKitConfig = useMemo(() => ({
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
  }), [paymasterEndpoint]);

  if (!paymasterEndpoint) {
    console.warn('⚠️ Paymaster endpoint not configured. Sponsorship will not work.');
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT!}
          chain={base}
          config={onchainKitConfig}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

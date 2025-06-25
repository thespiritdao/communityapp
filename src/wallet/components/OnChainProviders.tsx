// src/wallet/components/OnchainProviders.tsx
'use client';

import React, { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { base } from 'wagmi/chains';
import { wagmiConfig } from 'src/config/wagmi.client';

// Create the QueryClient instance
const queryClient = new QueryClient();

interface OnchainProvidersProps {
  children: ReactNode;
}

/**
 * Wraps the app with Wagmi, React Query, and OnchainKit contexts.
 */
export function OnchainProviders({ children }: OnchainProvidersProps) {
  // Validate paymaster configuration
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;

  if (!paymasterEndpoint) {
    console.warn('Paymaster endpoint not configured. Sponsorship will not work.');
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT!}
          chain={base}
          config={{
            appearance: {
              name: 'SpiritDAO',
              logo: '/spiritdaosymbol.png',
              mode: 'auto',
              theme: 'minimal',
            },
            wallet: {
              display: 'modal',
              termsUrl: 'https://yourapp.com/terms',
              privacyUrl: 'https://yourapp.com/privacy',
            },
            paymaster: process.env.NEXT_PUBLIC_PAYMASTER,
          }}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

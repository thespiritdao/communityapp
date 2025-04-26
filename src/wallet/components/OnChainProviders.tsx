// src/wallet/components/OnChainProviders.tsx
'use client';
import React from 'react';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
import type { ReactNode } from 'react';

type Props = { children: ReactNode };

export function OnchainProviders({ children }: Props) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT}
      chain={base}
      config={{
        appearance: {
          name: 'SpiritDAO Community',
          logo: '/images/spiritdaosymbol.png',
          mode: 'auto',
          theme: 'default',
        },
        wallet: {
          display: 'classic',
          termsUrl: 'https://yourapp.com/terms',
          privacyUrl: 'https://yourapp.com/privacy',
        },
        paymaster: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
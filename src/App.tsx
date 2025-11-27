// src/App.tsx — Corrected OnchainKit configuration
'use client';
import type React from 'react';
import { WagmiConfig, } from 'wagmi';
import { wagmiConfig } from '@/config/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';
import { SafeAppsProvider } from '@safe-global/safe-apps-react';
import { TokenBalancesProvider } from '@/context/TokenBalancesContext';
import { SnapshotProvider } from '@/context/SnapshotContext';
import { ProposalProvider } from '@/context/ProposalContext';
import { AuthProvider } from '@/features/identity/components/AuthProvider';

const queryClient = new QueryClient();

export default function App({ children }: { children: React.ReactNode }) {

  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SafeAppsProvider>
          <AuthProvider>
            <TokenBalancesProvider>
            <OnchainKitProvider
              apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT!}
              chain={base}
              config={{
                appearance: {
                  name: 'SpiritDAO',
                  logo: '/spiritdaosymbol.png',
                  mode: 'auto',
                  theme: 'default',
                },
                paymasterAndBundlerUrl: process.env.NEXT_PUBLIC_PAYMASTER,
                wallet: {
                  display: 'classic',
                  termsUrl: 'https://yourapp.com/terms',
                  privacyUrl: 'https://yourapp.com/privacy',
                },
              }}
            >
                <SnapshotProvider>
                  <ProposalProvider>
                    <div style={{ padding: '1rem' }}>
                      {children}
                    </div>
                  </ProposalProvider>
                </SnapshotProvider>
            </OnchainKitProvider>
            </TokenBalancesProvider>
          </AuthProvider>
        </SafeAppsProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}

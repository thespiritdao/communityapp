// src/App.tsx — Corrected OnchainKit configuration
'use client';
import React, { useEffect, useState } from 'react';
import { WagmiConfig, useAccount } from 'wagmi';
import { wagmiConfig } from 'src/config/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'viem/chains';
import { supabase } from 'src/utils/supabaseClient';
import { createSupabaseSession } from 'src/utils/createSupabaseSession';
import { SafeAppsProvider } from '@safe-global/safe-apps-react';
import { TokenBalancesProvider } from 'src/context/TokenBalancesContext';
import { SnapshotProvider } from 'src/context/SnapshotContext';
import { ProposalProvider } from 'src/context/ProposalContext';

const queryClient = new QueryClient();

export default function App({ children }: { children: React.ReactNode }) {
  const { address, isConnecting, isDisconnected } = useAccount();
  const [session, setSession] = useState<any>(null);

  // Debug OnchainKit configuration on mount
  useEffect(() => {
    console.log('OnchainKit Provider Config:', {
      isApiKeyConfigured: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
      apiKey: process.env.NEXT_PUBLIC_CDP_API_CLIENT?.substring(0, 5) + '...',
      isPaymasterConfigured: Boolean(process.env.NEXT_PUBLIC_PAYMASTER),
      paymasterUrl: process.env.NEXT_PUBLIC_PAYMASTER
        ?.substring(0, 20) + '...',
      chainId: base.id,
      governorContract: process.env.NEXT_PUBLIC_DAO_GOVERNOR?.substring(0, 10) + '...',
      advocateContract: process.env.NEXT_PUBLIC_ADVOCATE?.substring(0, 10) + '...',
    });

    if (!process.env.NEXT_PUBLIC_CDP_API_CLIENT) {
      console.error('Missing NEXT_PUBLIC_CDP_API_CLIENT — OnchainKit features may not work');
    }
    if (!process.env.NEXT_PUBLIC_PAYMASTER) {
      console.warn('Missing NEXT_PUBLIC_PAYMASTER — Gas sponsorship disabled');
    }
    if (!process.env.NEXT_PUBLIC_DAO_GOVERNOR) {
      console.warn('Missing NEXT_PUBLIC_DAO_GOVERNOR — Proposal submission disabled');
    }
    if (!process.env.NEXT_PUBLIC_ADVOCATE) {
      console.warn('Missing NEXT_PUBLIC_ADVOCATE — Proposal validation disabled');
    }
  }, []);

  // Refresh Supabase session when wallet connects/disconnects
  useEffect(() => {
    const refreshAuth = async () => {
      if (address && !isConnecting && !isDisconnected) {
        console.log('Checking Supabase session…');
        const { data: { session: storedSession } } = await supabase.auth.getSession();
        if (!storedSession || storedSession.expires_at < Date.now() / 1000) {
          console.warn('Session expired or missing. Refreshing…');
          try {
            const newSession = await createSupabaseSession(
              storedSession?.access_token,
              storedSession?.refresh_token
            );
            setSession(newSession);
          } catch (err) {
            console.error('Error refreshing Supabase session:', err);
          }
        } else {
          setSession(storedSession);
        }
      }
    };

    refreshAuth();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (newSession) {
          console.log('Session updated:', newSession);
          setSession(newSession);
        } else {
          console.log('User signed out. Clearing session.');
          setSession(null);
        }
      }
    );

    return () => {
      authListener.subscription?.unsubscribe();
    };
  }, [address, isConnecting, isDisconnected]);

  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SafeAppsProvider>
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
        </SafeAppsProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}

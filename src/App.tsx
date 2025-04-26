// src/App.tsx
'use client';
import React, { useEffect, useState } from 'react';
import { WagmiConfig, useAccount } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { base } from 'viem/chains';
import { supabase } from 'src/utils/supabaseClient';
import { createSupabaseSession } from 'src/utils/createSupabaseSession';
import { SafeAppsProvider } from '@safe-global/safe-apps-react';
import { TokenBalancesProvider } from "src/context/TokenBalancesContext";
import { SnapshotProvider } from 'src/context/SnapshotContext';
import "src/styles/index.css";

// Define the constant to match with components
const BASE_CHAIN_ID = 8453; // Match with the constant used in Cart.tsx

const queryClient = new QueryClient();

export default function App({ children }) {
  const { address, isConnecting, isDisconnected } = useAccount();
  const [session, setSession] = useState(null);

  // Debug OnchainKit configuration on mount
  useEffect(() => {
    console.log("OnchainKit Provider Config:", {
      isApiKeyConfigured: Boolean(process.env.NEXT_PUBLIC_CDP_API_CLIENT),
      apiKey: process.env.NEXT_PUBLIC_CDP_API_CLIENT?.substring(0, 5) + "...",
      isPaymasterConfigured: Boolean(process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT),
      paymasterEndpoint: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT?.substring(0, 20) + "...",
      chainId: BASE_CHAIN_ID,
    });
  }, []);
  
  useEffect(() => {
    const refreshAuth = async () => {
      if (address && !isConnecting && !isDisconnected) {
        console.log('Checking Supabase session...');
        const storedSession = await supabase.auth.getSession();
        if (!storedSession || storedSession.session?.expires_at < Date.now() / 1000) {
          console.warn('Session expired or missing. Refreshing...');
          try {
            const newSession = await createSupabaseSession(
              storedSession?.session?.access_token,
              storedSession?.session?.refresh_token
            );
            setSession(newSession);
          } catch (err) {
            console.error('Error refreshing Supabase session:', err);
          }
        } else {
          setSession(storedSession.session);
        }
      }
    };
    refreshAuth();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          console.log('User signed out. Clearing session.');
          setSession(null);
        } else if (session) {
          console.log('Session updated:', session);
          setSession(session);
        }
      }
    );
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [address, isConnecting, isDisconnected]);

  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <TokenBalancesProvider>
          {/* Wrap with OnchainKitProvider to enable paymaster and sponsored transaction features */}
          <OnchainKitProvider
            apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT as string}
            chain={base} // Make sure base.id === BASE_CHAIN_ID (8453)
            config={{
              paymaster: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT,
              appearance: {
                name: 'SpiritDAO',
                logo: '/spiritdaosymbol.png',
                mode: 'auto',
                theme: 'default'
              },
              wallet: {
                display: 'classic',
                termsUrl: 'https://yourapp.com/terms',
                privacyUrl: 'https://yourapp.com/privacy'
              }
            }}
          >
            <RainbowKitProvider modalSize="compact">
              <SnapshotProvider>
                <div style={{ padding: '1rem' }}>
                  {children}
                </div>
              </SnapshotProvider>
            </RainbowKitProvider>
          </OnchainKitProvider>
        </TokenBalancesProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}
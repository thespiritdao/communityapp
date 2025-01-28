// src/App.tsx

'use client';

import React, { useEffect } from 'react';
import { WagmiConfig } from 'wagmi';
import { wagmiConfig } from './config/wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import type { ReactNode } from 'react';
import { base } from 'viem/chains';
import { supabase } from 'src/features/identity/utils/supabaseClient';
import { createSupabaseSession } from 'src/auth/utils/createSupabaseSession';
import { useAccount } from 'wagmi';

const queryClient = new QueryClient();

type AppProps = {
  children: ReactNode;
};

useEffect(() => {
  const initiateSupabaseSession = async () => {
    if (address && !isConnecting && !isDisconnected) {
      console.log('Wallet connected. Creating Supabase session...');
      try {
        const session = await createSupabaseSession(address);
        console.log('Supabase session:', session); // Log the session for debugging
      } catch (err) {
        console.error('Failed to create Supabase session:', err);
      }
    }
  };

  initiateSupabaseSession();
}, [address, isConnecting, isDisconnected]);


  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY as string}
          chain={base}
        >
          <RainbowKitProvider modalSize="compact">
            {/* Top-level layout wrapper */}
            <div style={{ padding: '1rem' }}>
              {/* The rest of your app */}
              {children}
            </div>
          </RainbowKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
};

export default App;

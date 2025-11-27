// src/providers/Providers.tsx
"use client";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/config/wagmi.client";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "viem/chains";
import { ProfilesProvider } from "../features/identity/context/ProfilesProvider";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export default function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT as string}
          chain={base}
          config={{
            appearance: {
              name: "SpiritDAO",
              logo: "/spiritdaosymbol.png",
              mode: "auto",
              theme: "default",
            },
            wallet: {
              display: "classic",
              termsUrl: "https://yourapp.com/terms",
              privacyUrl: "https://yourapp.com/privacy", // FIXED: was "privacUrl"
            },
            paymaster: process.env.NEXT_PUBLIC_PAYMASTER as string,
          }}
        >
          <RainbowKitProvider modalSize="compact">
            <ProfilesProvider>
              {children}
            </ProfilesProvider>
          </RainbowKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
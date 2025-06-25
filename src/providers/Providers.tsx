// src/providers/Providers.tsx
"use client";
import { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "src/config/wagmi.client";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "viem/chains";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
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
            {children}
          </RainbowKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
// src/providers/Providers.tsx
"use client";

import { ReactNode } from "react";
import { WagmiConfig } from "wagmi";
import { wagmiConfig } from "src/config/wagmi.client";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { base } from "viem/chains";

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_CLIENT as string}
          chain={base}
          config={{
            paymaster: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT,
            appearance: {
              name: "SpiritDAO",
              logo: "/spiritdaosymbol.png",
              mode: "auto",
              theme: "default",
            },
            wallet: {
              display: "classic",
              termsUrl: "https://yourapp.com/terms",
              privacyUrl: "https://yourapp.com/privacy",
            },
          }}
        >
          <RainbowKitProvider modalSize="compact">
            {children}
          </RainbowKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
}

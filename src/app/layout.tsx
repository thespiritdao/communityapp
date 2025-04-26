// src/app/layout.tsx
"use client";

import { ReactNode } from "react";
import { OnchainProviders } from "src/wallet/components/OnchainProviders";
import { CommunityProvider } from "src/context/CommunityContext";
import BottomNav from "src/components/BottomNav";
import { TokenBalancesProvider } from "src/context/TokenBalancesContext";
import Providers from "src/providers/Providers";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <TokenBalancesProvider>
            <OnchainProviders>
              <CommunityProvider>
                <div className="relative min-h-screen">
                  {children}
                  {/* Always rendered at the bottom */}
                  <BottomNav />
                </div>
              </CommunityProvider>
            </OnchainProviders>
          </TokenBalancesProvider>
        </Providers>
      </body>
    </html>
  );
}

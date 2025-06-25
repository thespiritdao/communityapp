// src/app/layout.tsx
"use client";
import { ReactNode } from "react";
import { CommunityProvider } from "src/context/CommunityContext";
import BottomNav from "src/components/BottomNav";
import { TokenBalancesProvider } from "src/context/TokenBalancesContext";
import { OnchainProviders } from "src/wallet/components/OnchainProviders";
import 'src/styles/index.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <OnchainProviders>
          <TokenBalancesProvider>
            <CommunityProvider>
              <div className="relative min-h-screen">
                {children}
                <BottomNav />
              </div>
            </CommunityProvider>
          </TokenBalancesProvider>
        </OnchainProviders>
      </body>
    </html>
  );
}
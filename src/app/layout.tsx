// src/app/layout.tsx
"use client";
import { ReactNode } from "react";
import { CommunityProvider } from "src/context/CommunityContext";
import { NotificationProvider } from "src/context/NotificationContext";
import { GovernanceNotificationProvider } from "src/context/GovernanceNotificationContext";
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
              <NotificationProvider>
                <GovernanceNotificationProvider>
                  <div className="relative min-h-screen">
                    {children}
                    <BottomNav />
                  </div>
                </GovernanceNotificationProvider>
              </NotificationProvider>
            </CommunityProvider>
          </TokenBalancesProvider>
        </OnchainProviders>
      </body>
    </html>
  );
}
// src/app/layout-client.tsx
"use client";

import React from "react";
import { OnchainProviders } from "src/wallet/components/OnchainProviders";
import { CommunityProvider } from "src/context/CommunityContext";
import BottomNav from "src/components/BottomNav";

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <OnchainProviders>
      <CommunityProvider>
        <div className="relative min-h-screen">
          {children}
          <BottomNav />
        </div>
      </CommunityProvider>
    </OnchainProviders>
  );
}

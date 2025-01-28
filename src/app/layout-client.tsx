// src/app/layout-client.tsx
"use client";

import React from "react";
import { CommunityProvider } from "src/context/CommunityContext";
import { OnchainProviders } from "src/wallet/components/OnchainProviders";

interface LayoutClientProps {
  children: React.ReactNode;
}

export default function LayoutClient({ children }: LayoutClientProps) {
  return (
    <OnchainProviders>
      <CommunityProvider>
        {children}
      </CommunityProvider>
    </OnchainProviders>
  );
}

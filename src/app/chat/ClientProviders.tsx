"use client";

import React from "react";
import { CommunityProvider } from "src/context/CommunityContext";

export default function ClientProviders({ children }: { children: React.ReactNode }) {
  return <CommunityProvider>{children}</CommunityProvider>;
}

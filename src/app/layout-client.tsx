// src/app/layout-client.tsx
"use client";

import React from "react";
import { CommunityProvider } from "src/context/CommunityContext";

interface LayoutClientProps {
  children: React.ReactNode;
}

const LayoutClient: React.FC<LayoutClientProps> = ({ children }) => {
  return <CommunityProvider>{children}</CommunityProvider>;
};

export default LayoutClient;

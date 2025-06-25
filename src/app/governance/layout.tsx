// src/app/governance/layout.tsx
'use client';

import React from 'react';
import Providers from "src/providers/Providers";

export default function GovernanceLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}

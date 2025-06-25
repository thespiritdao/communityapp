// src/app/delegation-proposal/page.tsx (or wherever your paymaster test route is)
'use client';

import React from 'react';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import PaymasterTest from 'src/features/proposals/PaymasterTest'; // Adjust import path as needed

export default function PaymasterTestPage() {
  return (
    <OnchainProviders>
      <div className="min-h-screen bg-gray-100">
        <PaymasterTest />
      </div>
    </OnchainProviders>
  );
}
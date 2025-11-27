// src/app/delegation-proposal/page.tsx (or wherever your paymaster test route is)
'use client';
import { OnchainProviders } from '@/wallet/components/OnchainProviders';
import PaymasterTest from '@/features/proposals/PaymasterTest'; // Adjust import path as needed

export default function PaymasterTestPage() {
  return (
    <OnchainProviders>
      <div className="min-h-screen bg-gray-100">
        <PaymasterTest />
      </div>
    </OnchainProviders>
  );
}

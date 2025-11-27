// src/app/delegation-proposal/page.tsx (or wherever your paymaster test route is)
'use client';
import PaymasterTest from '@/features/proposals/PaymasterTest';

export default function PaymasterTestPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <PaymasterTest />
    </div>
  );
}

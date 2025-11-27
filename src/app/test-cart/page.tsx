// src/pages/test-cart/page.tsx
'use client';

import { Marketplace } from '@/features/shopping-cart/components/Marketplace/Marketplace';

export default function TestCartPage() {
  return (
    <main className="min-h-screen bg-gray-50 bottom-nav-spacing">
      <Marketplace />
    </main>
  );
}
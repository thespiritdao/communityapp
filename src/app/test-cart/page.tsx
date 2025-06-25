// src/pages/test-cart/page.tsx
'use client';

import { Store } from 'src/features/test-cart/components/Store';

export default function TestCartPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      <Store />
    </main>
  );
}
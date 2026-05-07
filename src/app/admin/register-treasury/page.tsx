// src/app/admin/register-treasury/page.tsx
'use client';

import { TreasuryRegistrationTool } from '@/features/pods/components/TreasuryRegistrationTool';

export default function RegisterTreasuryPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '24px', backgroundColor: '#f5f4ed' }}>
      <TreasuryRegistrationTool />
    </div>
  );
}

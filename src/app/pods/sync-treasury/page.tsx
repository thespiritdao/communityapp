'use client';

import PodTreasurySync from '@/features/pods/components/PodTreasurySync';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';

export default function SyncTreasuryPage() {
  return (
    <PodPageLayout
      title="Sync Pod Treasury"
      description="Sync your pod's treasury address to blockchain authorization contracts"
      showBackButton={true}
    >
      <PodTreasurySync />
    </PodPageLayout>
  );
}

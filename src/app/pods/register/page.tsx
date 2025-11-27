'use client';

import { PodRegistrationManager } from '@/features/pods/components/PodRegistrationManager';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';

export default function PodRegistrationPage() {
  return (
    <PodPageLayout
      title="Register Existing Pods"
      description="Register your existing HATS-based pods in the smart contract for full treasury functionality."
      showBackButton={true}
    >
      <PodRegistrationManager />
    </PodPageLayout>
  );
}

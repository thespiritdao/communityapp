'use client';

import { HatImageViewer } from '@/features/pods/components/HatImageViewer';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';

export default function HatImagesPage() {
  return (
    <PodPageLayout
      title="HAT Image Viewer"
      description="Fetch the real image URIs from your deployed HATS to use in createPodProposal calls."
      showBackButton={true}
    >
      <HatImageViewer />
    </PodPageLayout>
  );
}

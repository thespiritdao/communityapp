'use client';
import dynamic from 'next/dynamic';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';
import { AnyPodLeaderGate } from '@/features/pods/components/PodAccessGate';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary/FeatureErrorBoundary';

// Load lazily to keep the route resilient during dev while UI libs reload
const HatsModulePodCreationForm = dynamic(
  () =>
    import('@/features/pods/components/HatsModulePodCreationForm').then(
      (mod) => mod.HatsModulePodCreationForm,
    ),
  { ssr: false },
);

export default function CreatePodWithModulesPage() {
  // Testing mode:
  // - On by default in development
  // - Can be explicitly toggled via NEXT_PUBLIC_PODS_TESTING_MODE="true"
  const testingMode =
    process.env.NODE_ENV === 'development' ||
    String(process.env.NEXT_PUBLIC_PODS_TESTING_MODE).toLowerCase() === 'true';

  const actions = testingMode && (
    <div className="inline-flex text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">
      Testing Mode (min leaders = 1; duplicate addresses allowed)
    </div>
  );

  return (
    <AnyPodLeaderGate>
      <FeatureErrorBoundary featureName="Pod Creation">
        <PodPageLayout
          title="Create Pod"
          description="Create a new pod with role management, eligibility criteria, and treasury integration."
          showBackButton={true}
          maxWidth="wide"
          actions={actions}
        >
          {/* NOTE: if you still see a red screen here, fix the missing UI import inside the component:
             src/features/pods/components/HatsModulePodCreationForm.tsx should be able to import Switch.
             See the "Double Check" section in this message. */}
          <HatsModulePodCreationForm testingMode={testingMode} />
        </PodPageLayout>
      </FeatureErrorBoundary>
    </AnyPodLeaderGate>
  );
}

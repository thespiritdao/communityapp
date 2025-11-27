import { Suspense } from 'react';
import { PodManageClient } from './PodManageClient';
import { PodManageErrorBoundary } from './components/PodManageErrorBoundary';

/**
 * Loading component for pod management
 */
function PodManageLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-8"></div>
        <div className="space-y-6">
          <div className="h-64 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    </div>
  );
}

interface PodManageLoaderProps {
  podId: string;
}

/**
 * Server Component that passes podId to client component
 * Client component will handle data loading with proper authentication
 */
export default function PodManageLoader({ podId }: PodManageLoaderProps) {
  console.log(
    '🔍 PodManageLoader: Delegating to client component for pod ID:',
    podId,
  );

  // Let the client component handle all data loading since it has access to authentication
  return (
    <PodManageErrorBoundary>
      <Suspense fallback={<PodManageLoading />}>
        <PodManageClient
          initialPod={null}
          initialLeaderProfiles={{}}
          podId={podId}
        />
      </Suspense>
    </PodManageErrorBoundary>
  );
}

'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * DEPRECATED: This route has been replaced by /pods/create-with-modules
 *
 * Reason: The old PodCreationForm used raw writeContract() calls that caused
 * gas estimation errors with Coinbase Smart Wallets. The new route uses
 * OnchainKit Transaction components which work correctly.
 *
 * This redirect is temporary - remove this file after confirming all links updated.
 */
export default function CreatePodPageDeprecated() {
  const router = useRouter();

  useEffect(() => {
    // Immediate redirect to the working route
    router.replace('/pods/create-with-modules');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-gray-600">Redirecting to pod creation...</p>
      </div>
    </div>
  );
}

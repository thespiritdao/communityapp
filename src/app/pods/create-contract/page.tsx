'use client';

import { PodContractCreator } from '@/features/pods/components/PodContractCreator';
import { PodPageLayout } from '@/features/pods/components/PodPageLayout';

export default function CreatePodContractPage() {
  const handlePodCreated = (podId: string) => {
    console.log('Pod created in contract:', podId);
    // Optionally update your database here
  };

  return (
    <PodPageLayout
      title="Create Pod in Smart Contract"
      description="Your database has pods, but they need to exist in the smart contract before treasury deployment works."
      showBackButton={true}
      maxWidth="wide"
    >
      <PodContractCreator onPodCreated={handlePodCreated} />

      <div className="mt-8 p-4 bg-yellow-50 rounded-lg">
        <h3 className="font-semibold text-yellow-800">⚠️ Important Notes:</h3>
        <ul className="text-yellow-700 text-sm mt-2 space-y-1">
          <li>
            • Pods must be created in the contract before treasury deployment
          </li>
          <li>
            • The process is: Create Proposal → Activate Pod → Treasury Deployed
          </li>
          <li>
            • You may need to adjust the Parent Hat ID based on your Hats setup
          </li>
          <li>
            • After activation, the pod will have both management and membership
            hats
          </li>
        </ul>
      </div>
    </PodPageLayout>
  );
}

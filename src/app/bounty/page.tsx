'use client';

import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { Loader2, CheckCircle } from 'lucide-react';
import { BountyFormV2 } from '@/features/bounty/components/BountyFormV2';
import { BountyManagement } from '@/features/bounty/components/BountyManagement';
import { useHybridPodPermission } from '@/hooks/useHybridPodPermission';
import { useBountyManagementAccess } from '@/features/bounty/hooks/useBountyManagementAccess';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary/FeatureErrorBoundary';
// import { PodFactorySync } from '@/features/pods/components/PodFactorySync'; // Commented out - not needed before launch (all pods will be created fresh)
import '@/features/bounty/styles/bounty.css';

const defaultCategories = [
  'Art / Media',
  'Community',
  'Content',
  'Design',
  'Development',
  'Education',
  'Events',
  'Marketing',
  'Operations',
  'Partnerships',
  'Research',
];

export default function BountyPage() {
  const { evmAddress: address } = useEvmAddress();
  const { managedPods, isLoading: podsLoading } = useBountyManagementAccess();
  const [activeTab, setActiveTab] = useState('public');
  const [selectedPodId, setSelectedPodId] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0); // Add refresh trigger

  // Check if selected pod is in managed pods (user has both module and permission)
  const podBountyPermission = managedPods.some(
    (pod) => pod.id === selectedPodId,
  );
  const permissionLoading = podsLoading;

  // Set initial pod selection if user has manageable pods
  useEffect(() => {
    if (managedPods.length > 0 && !selectedPodId) {
      // Auto-select first manageable pod (already filtered by module + permission)
      setSelectedPodId(managedPods[0].id);
    }
    // Don't include selectedPodId to avoid re-render loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managedPods]);

  if (!address) {
    return (
      <div className="container mx-auto py-8 bottom-nav-spacing">
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">
            Please connect your wallet to access bounties.
          </p>
        </div>
      </div>
    );
  }

  return (
    <FeatureErrorBoundary featureName="Bounty Management">
      <div
        className="container mx-auto py-8 bottom-nav-spacing"
        style={{
          backgroundImage: 'url("/images/chatbg.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          minHeight: '100vh',
        }}
      >
        <h1 className="text-3xl font-bold mb-8">Bounties</h1>

        {/* Pod Selection */}
        {podsLoading && (
          <div className="mb-6 p-4 bg-[#E8F1EE] border border-[#2F5D50] rounded-lg">
            <p className="text-[#2F5D50] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading pods and
              verifying permissions...
            </p>
          </div>
        )}

        {!podsLoading && managedPods.length > 0 && (
          <div className="mb-6 p-4 bg-[#E8F1EE] border border-[#2F5D50] rounded-lg">
            <h3 className="font-medium text-[#2F5D50] mb-2">
              Select Pod
            </h3>
            <select
              value={selectedPodId}
              onChange={(e) => setSelectedPodId(e.target.value)}
              className="w-full p-2 border rounded-md bg-white"
            >
              <option value="">Select a pod...</option>
              {managedPods.map((pod) => (
                <option key={pod.id} value={pod.id}>
                  {pod.name}
                </option>
              ))}
            </select>
            {selectedPodId && (
              <div className="mt-2 text-sm text-[#3F7A5A]">
                <p className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Pod selected:{' '}
                  {managedPods.find((p) => p.id === selectedPodId)?.name}
                </p>
                <p className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Bounty Module: ON
                </p>
                <p className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Bounty Management
                  Permission: Granted
                </p>
              </div>
            )}
          </div>
        )}

        {!podsLoading && managedPods.length === 0 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="font-medium text-yellow-800 mb-2">
              No Pods Available for Bounty Management
            </h3>
            <p className="text-sm text-yellow-700 mb-2">
              To create and manage bounties in a pod, you need:
            </p>
            <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
              <li>
                <strong>Bounty Module ON</strong> (pod-wide setting)
              </li>
              <li>
                <strong>Bounty Management Permission</strong> (your role in the
                pod)
              </li>
            </ul>
            <p className="text-sm text-yellow-600 mt-2">
              Contact your pod administrators to enable the bounty module or
              grant you bounty management permissions.
            </p>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="public">Public</TabsTrigger>
            {/* <TabsTrigger value="sync">Sync</TabsTrigger> */}{' '}
            {/* Commented out - not needed before launch */}
            {selectedPodId && podBountyPermission && !permissionLoading && (
              <TabsTrigger value="create">Create</TabsTrigger>
            )}
            {selectedPodId && podBountyPermission && !permissionLoading && (
              <TabsTrigger value="manage">Manage</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="public">
            <BountyManagement
              key={`public-${refreshKey}`}
              podId={selectedPodId || 'all'}
              canManageBounties={false}
            />
            {!selectedPodId && managedPods.length > 0 && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-yellow-800">
                  Select a pod above to create bounties and access management
                  options.
                </p>
              </div>
            )}
          </TabsContent>

          {/* SYNC TAB - Commented out (not needed before launch - all pods will be created fresh)
        <TabsContent value="sync">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-6">Pod Factory Sync</h2>
            <p className="text-gray-600 mb-6">
              Sync your pod data using the factory pattern for scalable authorization without manual whitelist management.
            </p>
            <PodFactorySync
              onSyncComplete={() => {
                console.log('Pod factory sync completed');
                // Refresh pod permissions
                if (selectedPodId) {
                  setActiveTab('public');
                }
              }}
            />
          </div>
        </TabsContent>
        */}

          {selectedPodId && podBountyPermission && (
            <TabsContent value="create">
              <div className="max-w-2xl mx-auto">
                <BountyFormV2
                  onSuccess={(bountyId) => {
                    console.log('Bounty created with ID:', bountyId);
                    // Trigger refresh and switch to public tab
                    setRefreshKey((prev) => prev + 1);
                    setTimeout(() => setActiveTab('public'), 100);
                  }}
                  categories={defaultCategories}
                />
              </div>
            </TabsContent>
          )}

          {selectedPodId && podBountyPermission && (
            <TabsContent value="manage">
              <BountyManagement
                key={`manage-${refreshKey}`}
                podId={selectedPodId}
                canManageBounties={podBountyPermission}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </FeatureErrorBoundary>
  );
}

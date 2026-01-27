'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Plus, Shapes, Loader2 } from 'lucide-react';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { PodCardGrid } from '@/features/pods/components';
import { useHatPermissions } from '@/features/pods/hooks/useHatPermissions';

// Use optimized hooks
import { usePods } from '@/features/pods/hooks';

export default function PodsPage() {
  const router = useRouter();
  const { address, isInitializing } = useCDPStatus();
  const [filter, setFilter] = useState<
    'all' | 'active' | 'draft' | 'proposed' | 'inactive'
  >('all');

  // Check pod creation permission
  const { hasPermission, isLoading: checkingPermissions } = useHatPermissions(address);
  const canCreatePod = hasPermission('subPodCreation');

  // Use optimized pods hook
  const {
    pods,
    loading,
    error: moduleError,
    handleMigration,
    handlePodToggle,
    canUserManagePod,
    isMigrating,
    migrationMessage,
    processingPods,
  } = usePods({ filter });

  // Get all unique addresses from pod leads for profile lookup
  const allLeadAddresses = pods.flatMap((pod) => pod.pod_leads || []);
  const { getProfile } = useProfiles(allLeadAddresses);

  // Show loading while CDP initializes
  if (isInitializing) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex justify-center items-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-gray-600">Connecting wallet...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="flex justify-center items-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-gray-600">Loading pods...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shapes className="h-8 w-8" />
            SpiritDAO Pods
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
          {/* Create Pod Button - Only visible for users with subPodCreation permission */}
          {canCreatePod && (
            <Link href="/pods/create-with-modules">
              <Button
                className="w-full sm:w-auto"
                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Pod
              </Button>
            </Link>
          )}

          {/* Show login prompt if not connected */}
          {!address && !checkingPermissions && (
            <div className="text-sm text-gray-600 px-2 py-2">
              Connect wallet to create pods
            </div>
          )}
        </div>

        {/* Migration status message */}
        {migrationMessage && (
          <div
            className={`mt-2 p-2 rounded text-sm ${
              migrationMessage.includes('✅')
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {migrationMessage}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {(['all', 'active', 'inactive', 'proposed', 'draft'] as const).map(
          (filterOption) => (
            <Button
              key={filterOption}
              variant={filter === filterOption ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(filterOption)}
              className="capitalize"
            >
              {filterOption}
            </Button>
          ),
        )}
      </div>

      {/* Error Display */}
      {moduleError && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="text-red-600 mr-3">⚠️</div>
              <div>
                <h4 className="text-red-800 font-semibold">
                  Module Loading Error
                </h4>
                <p className="text-red-600 text-sm">{moduleError}</p>
              </div>
            </div>
            <Button
              onClick={() => window.location.reload()}
              className="text-white hover:bg-[#254A40]"
              size="sm"
              style={{ backgroundColor: '#2F5D50' }}
            >
              Refresh Page
            </Button>
          </div>
        </div>
      )}

      {/* Pods Grid */}
      {moduleError ? (
        <div className="text-center py-8">
          <p className="text-red-600">Please refresh the page to continue.</p>
        </div>
      ) : pods.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No pods found
          </h3>
          <p className="text-gray-600 mb-4">
            {filter === 'all'
              ? 'No pods have been created yet.'
              : `No ${filter} pods found.`}
          </p>
          <Link href="/pods/create-with-modules">
            <Button>Create Your First Pod</Button>
          </Link>
        </div>
      ) : (
        <PodCardGrid
          pods={pods}
          canUserManagePod={canUserManagePod}
          getProfile={getProfile}
        />
      )}

      {/* Stats */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{pods.length}</div>
            <p className="text-xs text-muted-foreground">Total Pods</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {pods.filter((p) => p.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">Active Pods</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {pods.filter((p) => p.status === 'proposed').length}
            </div>
            <p className="text-xs text-muted-foreground">Pending Approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">
              {pods.filter((p) => p.status === 'draft').length}
            </div>
            <p className="text-xs text-muted-foreground">Draft Pods</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

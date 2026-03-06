'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Plus, Shapes, Loader2, Shield, GitBranch } from 'lucide-react';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { PodCardGrid } from '@/features/pods/components';
import { useDatabaseFirstPermissions } from '@/hooks/useDatabaseFirstPermissions';
import { PodRolePermissionsService } from '@/features/pods/services/PodRolePermissionsService';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { supabase } from '@/utils/supabaseClient';

// Use optimized hooks
import { usePods } from '@/features/pods/hooks';

export default function PodsPage() {
  const router = useRouter();
  const { address, isInitializing } = useCDPStatus();
  const [filter, setFilter] = useState<
    'all' | 'active' | 'draft' | 'proposed' | 'inactive'
  >('all');

  // Check pod creation permission using database-first approach
  const [canCreatePod, setCanCreatePod] = useState(false);
  const { memberships, isLoading: permissionsLoading } = useDatabaseFirstPermissions();

  // Exec hat check — show top-level pod review banner
  const [isExecLeader, setIsExecLeader] = useState(false);

  // Sub-pod review: pod IDs where user is leader + sub-pods enabled + pending proposals exist
  const [podsPendingReview, setPodsPendingReview] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!address || !process.env.NEXT_PUBLIC_HATS_CONTRACT) return;
    const checkExec = async () => {
      try {
        // Fetch hat registry directly — avoids race with HatRegistryInitializer
        const res = await fetch('/api/hat-registry');
        const ids = await res.json();
        const execHatId: string | undefined = ids['EXECUTIVE_POD_LEADER'];
        if (!execHatId) return;
        const publicClient = createPublicClient({
          chain: base,
          transport: http(process.env.NEXT_PUBLIC_RPC_URL || 'https://mainnet.base.org'),
        });
        const bal = await publicClient.readContract({
          address: process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`,
          abi: [{ name: 'balanceOf', type: 'function', inputs: [{ name: 'wearer', type: 'address' }, { name: 'hatId', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
          functionName: 'balanceOf',
          args: [address as `0x${string}`, BigInt(execHatId)],
        });
        setIsExecLeader((bal as bigint) > 0n);
      } catch {
        // silently ignore — banner just won't show
      }
    };
    checkExec();
  }, [address]);

  useEffect(() => {
    if (!address || memberships.length === 0) return;

    const checkSubPodReviews = async () => {
      // Find pods where user is a leader
      const ledPodIds = memberships
        .filter((m) => m.role === 'leader')
        .map((m) => m.podId);
      if (ledPodIds.length === 0) return;

      // Check which have sub_pods_enabled
      const { data: modules } = await supabase
        .from('pod_modules')
        .select('pod_id')
        .in('pod_id', ledPodIds)
        .eq('sub_pods_enabled', true);
      const enabledIds = modules?.map((m: any) => m.pod_id) ?? [];
      if (enabledIds.length === 0) return;

      // Check which have pending sub-pod proposals
      const { data: pending } = await supabase
        .from('pods')
        .select('id, name, parent_pod_id')
        .in('parent_pod_id', enabledIds)
        .eq('status', 'pending_review');

      if (!pending || pending.length === 0) return;

      // Group by parent — get unique parent pods that have pending children
      const parentIds = [...new Set(pending.map((p: any) => p.parent_pod_id as string))];
      const { data: parentPods } = await supabase
        .from('pods')
        .select('id, name')
        .in('id', parentIds);

      setPodsPendingReview(parentPods ?? []);
    };

    checkSubPodReviews();
  }, [address, memberships]);

  useEffect(() => {
    const checkSubPodPermission = async () => {
      if (!address || memberships.length === 0) {
        setCanCreatePod(false);
        return;
      }

      try {
        // Check if user has subPodCreation permission in ANY pod they're a member of
        const hasPermission = await Promise.all(
          memberships.map(async (membership) => {
            const rolePerms = await PodRolePermissionsService.getPodRolePermissions(membership.podId);

            // Find role permission matching this user's hat
            const userRolePerm = rolePerms.find(
              (rolePerm) => rolePerm.token_address === membership.hatId
            );

            return userRolePerm?.permissions?.subPodCreation === true;
          })
        );

        // User can create pods if they have the permission in any pod
        setCanCreatePod(hasPermission.some((hasPerm) => hasPerm === true));
      } catch (error) {
        console.error('Failed to check pod creation permission:', error);
        setCanCreatePod(false);
      }
    };

    checkSubPodPermission();
  }, [address, memberships]);

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
          {!address && !permissionsLoading && (
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

      {/* Exec: top-level pod review banner */}
      {isExecLeader && (
        <Link href="/pods/review">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 hover:bg-green-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-700 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Pods Pending Approval</p>
                <p className="text-xs text-green-700">Review and activate new pod proposals</p>
              </div>
            </div>
            <Button size="sm" className="shrink-0 bg-green-700 hover:bg-green-800 text-white">
              Review
            </Button>
          </div>
        </Link>
      )}

      {/* Pod leader: sub-pod review banners */}
      {podsPendingReview.map((pod) => (
        <Link key={pod.id} href={`/pods/${pod.id}/manage?tab=sub_pod_review`}>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 hover:bg-blue-100 transition-colors cursor-pointer">
            <div className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-blue-700 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Sub-Pod Proposals — {pod.name}</p>
                <p className="text-xs text-blue-700">Pending proposals awaiting your approval</p>
              </div>
            </div>
            <Button size="sm" className="shrink-0 bg-blue-700 hover:bg-blue-800 text-white">
              Review
            </Button>
          </div>
        </Link>
      ))}

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

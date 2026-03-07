/**
 * Pod Management Container - Optimized container component
 *
 * Provides a clean, memoized interface between the page and child components
 * with stable prop surfaces and proper performance optimizations.
 */

'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Crown,
  Settings,
  DollarSign,
  Package,
  Trash2,
  FileText,
  ClipboardList,
  Image as ImageIcon,
  GitBranch,
} from 'lucide-react';
import { MembersPanel } from './MembersPanel/MembersPanel';
import { PodManagerControlPanel } from './PodManagerControlPanel';
import { PodSpecificTreasuryManager } from './PodSpecificTreasuryManager';
import PodModulesManager from './PodModulesManager';
import { AgreementsPanel } from './AgreementsPanel';
import { ApplicationsPanel } from './ApplicationApproval';
import { PodDeletionButtonV2 } from '@/app/pods/[id]/manage/components/PodDeletionButtonV2';
import { ClaimManagementHATButton } from './ClaimManagementHATButton';
import { PodSettingsPanel } from './PodSettingsPanel';
import { SubPodReviewPanel } from './SubPodReviewPanel';
import { usePodManagementState } from '../hooks/usePodManagementState';
import { usePodManagementHandlers } from '../hooks/usePodManagementHandlers';
import '../styles/tab-navigation.css';

interface PodManagementContainerProps {
  podId: string;
  userAddress?: string;
  toast?: (options: any) => void;
  onClickName?: (address: string) => void;
  initialTab?: string;
}

/**
 * Memoized tab content to prevent unnecessary re-renders
 */
const TabContent = React.memo<{
  activeTab: string;
  leaders: string[];
  members: string[];
  memberRefs: import('../types').MemberRef[]; // ✅ ISSUE #7: Full member data
  isLoadingMembers: boolean;
  onClickName: (address: string) => void;
  podId: string;
  userAddress?: string;
  pod: any;
  canManageMembers: boolean;
  canManageTreasury: boolean;
  onRemoveMember?: (address: string, requiresVote: boolean) => void;
  onPodDeleted?: () => void;
}>(
  ({
    activeTab,
    leaders,
    members,
    memberRefs, // ✅ ISSUE #7: Extract memberRefs
    isLoadingMembers,
    onClickName,
    podId,
    userAddress,
    pod,
    canManageMembers,
    canManageTreasury,
    onRemoveMember,
    onPodDeleted,
  }) => {
    switch (activeTab) {
      case 'members':
        return (
          <MembersPanel
            leaders={leaders}
            members={members}
            memberRefs={memberRefs}
            loading={isLoadingMembers}
            onClickName={onClickName}
            podId={podId}
            userAddress={userAddress}
            onRemoveMember={onRemoveMember}
            canManageMembers={canManageMembers}
            podName={pod?.name}
          />
        );

      case 'settings':
        return (
          <div className="p-6">
            <PodManagerControlPanel
              podId={podId}
              podName={pod?.name || 'Unknown Pod'}
              userHatId={userAddress || ''}
              canManageMembers={canManageMembers}
            />
          </div>
        );

      case 'agreements':
        return (
          <AgreementsPanel podId={podId} canManageMembers={canManageMembers} />
        );

      case 'applications':
        return (
          <ApplicationsPanel
            podId={podId}
            canManageMembers={canManageMembers}
          />
        );

      case 'treasury':
        return (
          <div className="p-6">
            <PodSpecificTreasuryManager
              pod={pod}
              canManageTreasury={canManageTreasury}
            />
          </div>
        );

      case 'modules':
        return (
          <div className="p-6">
            <PodModulesManager
              podId={podId}
              podName={pod?.name || 'Unknown Pod'}
              isManager={canManageMembers}
              managementHatId={pod?.management_hat_id}
              membershipHatId={pod?.membership_hat_id}
            />
          </div>
        );

      case 'sub_pod_review':
        return (
          <div className="p-6">
            <SubPodReviewPanel
              podId={podId}
              podName={pod?.name || 'This Pod'}
              canManage={canManageMembers}
            />
          </div>
        );

      case 'deletion':
        return (
          <div className="p-6">
            <PodDeletionButtonV2
              pod={pod}
              canManage={canManageMembers}
              onDeleteComplete={onPodDeleted}
            />
          </div>
        );

      case 'pod_settings':
        return (
          <div className="p-6">
            <PodSettingsPanel
              podId={podId}
              podName={pod?.name || 'Unknown Pod'}
              currentImageUrl={pod?.pod_image_url}
              canManage={canManageMembers}
            />
          </div>
        );

      default:
        return null;
    }
  },
);

TabContent.displayName = 'TabContent';

/**
 * Memoized tab navigation to prevent unnecessary re-renders
 */
const TabNavigation = React.memo<{
  activeTab: string;
  onTabChange: (tab: string) => void;
  memberCount: number;
  leaderCount: number;
  canManageMembers: boolean;
  canManageTreasury: boolean;
  subPodsEnabled?: boolean;
}>(
  ({
    activeTab,
    onTabChange,
    memberCount,
    leaderCount,
    canManageMembers,
    canManageTreasury,
    subPodsEnabled = false,
  }) => {
    const tabs = React.useMemo(
      () => [
        {
          id: 'members',
          label: 'Members',
          mobileLabel: 'Members',
          icon: Users,
          badge: null,
          enabled: true,
        },
        {
          id: 'applications',
          label: 'Applications',
          mobileLabel: 'Apps',
          icon: ClipboardList,
          badge: null,
          enabled: canManageMembers, // Only leaders can view applications
        },
        {
          id: 'settings',
          label: 'Manager Controls',
          mobileLabel: 'Controls',
          icon: Settings,
          badge: null,
          enabled: canManageMembers,
        },
        {
          id: 'agreements',
          label: 'Agreements',
          mobileLabel: 'Agreements',
          icon: FileText,
          badge: null,
          enabled: true, // Always show Agreements tab
        },
        {
          id: 'modules',
          label: 'Modules',
          mobileLabel: 'Modules',
          icon: Package,
          badge: null,
          enabled: canManageMembers,
        },
        {
          id: 'treasury',
          label: 'Treasury',
          mobileLabel: 'Treasury',
          icon: DollarSign,
          badge: null,
          enabled: canManageTreasury, // Only show if user has treasury management access
        },
        {
          id: 'pod_settings',
          label: 'Pod Settings',
          mobileLabel: 'Settings',
          icon: ImageIcon,
          badge: null,
          enabled: canManageMembers, // Only pod leaders can edit settings
        },
        {
          id: 'sub_pod_review',
          label: 'Sub-Pods',
          mobileLabel: 'Sub-Pods',
          icon: GitBranch,
          badge: null,
          enabled: canManageMembers && subPodsEnabled,
        },
        {
          id: 'deletion',
          label: 'Delete Pod',
          mobileLabel: 'Delete',
          icon: Trash2,
          badge: null,
          enabled: canManageMembers, // Only pod leaders can delete
        },
      ],
      [memberCount, leaderCount, canManageMembers, canManageTreasury, subPodsEnabled],
    );

    // Add a small loading state to prevent layout shift
    const [isClient, setIsClient] = React.useState(false);
    React.useEffect(() => {
      setIsClient(true);
    }, []);

    if (!isClient) {
      // Return a skeleton that matches the expected height to prevent layout shift
      return (
        <div className="border-b border-gray-200 w-full">
          <div className="h-[56px] md:h-[64px] flex items-center justify-center">
            <div className="flex space-x-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-8 w-20 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="border-b border-gray-200 w-full overflow-hidden">
        {/* Mobile: Horizontal scrollable tabs */}
        <div className="md:hidden w-full overflow-hidden">
          <div className="flex overflow-x-auto scrollbar-hide scroll-smooth w-full">
            <div className="flex space-x-1 px-2 py-2 min-w-full">
              {tabs.map((tab) => {
                if (!tab.enabled) return null;

                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex flex-col items-center justify-center px-2 py-3 min-w-[70px] text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                    style={
                      isActive
                        ? {
                            borderColor: '#2F5D50',
                            color: '#1F453A',
                            backgroundColor: '#E8F1EE',
                          }
                        : {}
                    }
                  >
                    <Icon className="h-5 w-5 mb-1" />
                    <span className="leading-tight">{tab.mobileLabel}</span>
                    {tab.badge !== null && (
                      <Badge
                        variant="outline"
                        className="mt-1 text-[10px] px-1 py-0 h-4 min-w-[16px]"
                      >
                        {tab.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Desktop: Use flex with wrap for better control */}
        <div className="hidden md:block w-full overflow-hidden">
          <div className="flex flex-wrap w-full">
            {tabs.map((tab) => {
              if (!tab.enabled) return null;

              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center justify-center space-x-2 px-4 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-1 min-w-[120px] ${
                    isActive
                      ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  style={
                    isActive
                      ? {
                          borderColor: '#2F5D50',
                          color: '#1F453A',
                          backgroundColor: '#E8F1EE',
                        }
                      : {}
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.badge !== null && (
                    <Badge variant="outline" className="ml-1">
                      {tab.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);

TabNavigation.displayName = 'TabNavigation';

/**
 * Memoized pod header to prevent unnecessary re-renders
 */
const PodHeader = React.memo<{
  pod: any;
  isLoading: boolean;
}>(({ pod, isLoading }) => {
  if (isLoading) {
    return (
      <CardHeader>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
        </div>
      </CardHeader>
    );
  }

  if (!pod) {
    return (
      <CardHeader>
        <CardTitle style={{ color: '#8B3A3A' }}>Pod Not Found</CardTitle>
      </CardHeader>
    );
  }

  return (
    <CardHeader>
      <div className="flex items-center space-x-3">
        {pod.pod_image_url && (
          <img
            src={pod.pod_image_url}
            alt={pod.name}
            className="w-12 h-12 rounded-lg object-cover"
          />
        )}
        <div className="flex-1">
          <CardTitle className="flex items-center space-x-2">
            <span>{pod.name}</span>
            <Crown className="h-5 w-5" style={{ color: '#C6933F' }} />
          </CardTitle>
          {pod.description && (
            <p className="text-sm text-gray-600 mt-1">{pod.description}</p>
          )}
        </div>
      </div>
    </CardHeader>
  );
});

PodHeader.displayName = 'PodHeader';

/**
 * Main pod management container with optimized rendering
 */
export const PodManagementContainer = React.memo<PodManagementContainerProps>(
  ({ podId, userAddress, toast, onClickName, initialTab }) => {
    // Centralized state management
    const {
      pod,
      isLoadingPod,
      leaders,
      members,
      memberRefs, // ✅ ISSUE #7: Get full member data for removal
      isLoadingMembers,
      canManageMembers,
      canManageTreasury,
      selectedTab,
      setSelectedTab,
    } = usePodManagementState({ podId, userAddress, initialTab });

    // 🔍 DEBUG: Log what container received from hook
    console.log('📦 PodManagementContainer received capabilities:', {
      canManageMembers,
      canManageTreasury,
      userAddress,
      podId,
    });

    // Centralized event handlers
    const { handleClickName: defaultHandleClickName, handleRemoveMember } =
      usePodManagementHandlers({ podId, toast });

    // Use passed onClickName or fall back to default
    const handleClickName = onClickName || defaultHandleClickName;

    // Handle pod deletion complete
    const handlePodDeleted = React.useCallback(() => {
      // Redirect to pods list or home page after deletion
      if (typeof window !== 'undefined') {
        window.location.href = '/pods';
      }
    }, []);

    // Memoized member counts
    const { memberCount, leaderCount } = React.useMemo(
      () => ({
        memberCount: members.length,
        leaderCount: leaders.length,
      }),
      [members.length, leaders.length],
    );

    // Check if sub-pods module is enabled for this pod
    const [subPodsEnabled, setSubPodsEnabled] = React.useState(false);
    React.useEffect(() => {
      if (!podId) return;
      import('@/utils/supabaseClient').then(({ supabase }) => {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!session?.access_token) return;
          fetch(`/api/pods/${podId}/modules`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
            .then((r) => r.json())
            .then((json) => setSubPodsEnabled(json.modules?.sub_pods_enabled ?? false))
            .catch(() => {});
        });
      });
    }, [podId]);

    return (
      <Card className="w-full max-w-6xl mx-auto">
        <PodHeader pod={pod} isLoading={isLoadingPod} />

        <CardContent className="p-0">
          {/* Claim Management HAT Button - only relevant once pod is active (hats minted by activatePod) */}
          {pod && pod.status === 'active' && pod.management_hat_id && userAddress && pod.pod_leads && (
            <div className="p-4 border-b">
              <ClaimManagementHATButton
                podId={podId}
                podName={pod.name || 'Unknown Pod'}
                managementHatId={pod.management_hat_id}
                podLeads={pod.pod_leads || []}
              />
            </div>
          )}

          <TabNavigation
            activeTab={selectedTab}
            onTabChange={setSelectedTab}
            memberCount={memberCount}
            leaderCount={leaderCount}
            canManageMembers={canManageMembers}
            canManageTreasury={canManageTreasury}
            subPodsEnabled={subPodsEnabled}
          />

          <TabContent
            activeTab={selectedTab}
            leaders={leaders}
            members={members}
            memberRefs={memberRefs}
            isLoadingMembers={isLoadingMembers}
            onClickName={handleClickName}
            podId={podId}
            userAddress={userAddress}
            pod={pod}
            canManageMembers={canManageMembers}
            canManageTreasury={canManageTreasury}
            onRemoveMember={handleRemoveMember}
            onPodDeleted={handlePodDeleted}
          />
        </CardContent>
      </Card>
    );
  },
);

PodManagementContainer.displayName = 'PodManagementContainer';

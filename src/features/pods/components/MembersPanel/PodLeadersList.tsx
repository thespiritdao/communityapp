'use client';

import React from 'react';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { MemberCard } from './MemberCard';
import { AdaptiveMemberListSkeleton } from './LoadingSkeletons';
import { EmptyMembersList } from './EmptyStates';
import { MemberLoadingError } from './ErrorStates';
import { usePodObservability } from '../../hooks/usePodObservability';

interface PodLeadersListProps {
  leaders: string[];
  onClickName: (address: string) => void;
  podId?: string;
  podName?: string; // ✅ ISSUE #7: Pod name for removal
  userAddress?: string;
  memberRefs?: import('../../types').MemberRef[]; // ✅ ISSUE #7: Full member data
  onRemoveMember?: (address: string, requiresVote: boolean) => void;
}

/**
 * Optimized pod leaders list with proper memoization and rendering optimizations
 */
export const PodLeadersList = React.memo<PodLeadersListProps>(
  ({
    leaders,
    onClickName,
    podId,
    podName,
    userAddress,
    memberRefs = [], // ✅ ISSUE #7: Default to empty array
    onRemoveMember,
  }) => {
    // Use the new useProfiles hook for batch fetching with caching
    const {
      isLoading,
      getProfile,
      error: profilesError,
      refetch,
    } = useProfiles(leaders, { staleTime: 5 * 60 * 1000 });

    // Add observability tracking - TEMPORARILY DISABLED
    const { trackMemberAction, trackError } = usePodObservability({
      podId: podId || '',
      userAddress,
      enabled: false, // Temporarily disabled to fix recursion
    });

    // Memoize leaders array comparison to prevent unnecessary re-renders
    const stableLeaders = React.useMemo(() => leaders, [leaders.join(',')]);

    // ✅ ISSUE #7: Helper to find memberRef by address
    const getMemberRef = React.useCallback(
      (address: string) => {
        return memberRefs.find(
          (ref) => ref.wallet.toLowerCase() === address.toLowerCase(),
        );
      },
      [memberRefs],
    );

    // Enhanced event handler with tracking
    const handleClickName = React.useCallback(
      (address: string) => {
        trackMemberAction('view_leader_profile', { leaderAddress: address });
        onClickName(address);
      },
      [onClickName, trackMemberAction],
    );

    // Track errors
    React.useEffect(() => {
      if (profilesError) {
        trackError(profilesError, {
          context: 'leader_profiles',
          leaderCount: leaders.length,
        });
      }
    }, [profilesError, trackError, leaders.length]);

    // Memoize the rendered member cards with enhanced handlers
    const memberCards = React.useMemo(() => {
      if (isLoading) return null;

      return stableLeaders.map((leader) => {
        const profile = getProfile(leader);
        const memberRef = getMemberRef(leader); // ✅ ISSUE #7: Get full member data

        return (
          <MemberCard
            key={leader}
            address={leader}
            profile={profile}
            memberRef={memberRef}
            podId={podId}
            podName={podName}
            onClickName={handleClickName}
            role="leader"
            isLeader={true}
            canRemove={!!onRemoveMember}
            isCurrentUser={leader.toLowerCase() === userAddress?.toLowerCase()}
            onRemoveMember={onRemoveMember}
            podLeaders={leaders}
            currentUserAddress={userAddress}
          />
        );
      });
    }, [
      stableLeaders,
      isLoading,
      getProfile,
      getMemberRef,
      podId,
      podName,
      handleClickName,
      onRemoveMember,
      userAddress,
      leaders,
    ]);

    // Error state - preserves existing UX
    if (profilesError && !isLoading) {
      return (
        <MemberLoadingError
          error={profilesError}
          onRetry={() => {
            trackMemberAction('retry_leader_load');
            refetch();
          }}
        />
      );
    }

    // Loading state
    if (isLoading) {
      return <AdaptiveMemberListSkeleton addresses={leaders} />;
    }

    // Empty state
    if (leaders.length === 0) {
      return <EmptyMembersList type="leaders" />;
    }

    return <div className="space-y-3">{memberCards}</div>;
  },
);

PodLeadersList.displayName = 'PodLeadersList';

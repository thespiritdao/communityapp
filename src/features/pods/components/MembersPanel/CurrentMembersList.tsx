'use client';

import React from 'react';
import { useProfiles } from '@/features/identity/hooks/useProfiles';
import { MemberCard } from './MemberCard';
import { AdaptiveMemberListSkeleton } from './LoadingSkeletons';
import { EmptyMembersList } from './EmptyStates';
import { MemberLoadingError } from './ErrorStates';
import { usePodObservability } from '../../hooks/usePodObservability';

interface CurrentMembersListProps {
  members: string[];
  onClickName: (address: string) => void;
  loading: boolean;
  podId?: string;
  podName?: string; // ✅ ISSUE #7: Pod name for removal
  userAddress?: string;
  leaders?: string[]; // List of pod leader addresses to determine role
  memberRefs?: import('../../types').MemberRef[]; // ✅ ISSUE #7: Full member data
  onRemoveMember?: (address: string, requiresVote: boolean) => void;
}

/**
 * Optimized current members list with proper memoization and rendering optimizations
 */
export const CurrentMembersList = React.memo<CurrentMembersListProps>(
  ({
    members,
    onClickName,
    loading,
    podId,
    podName,
    userAddress,
    leaders = [],
    memberRefs = [], // ✅ ISSUE #7: Default to empty array
    onRemoveMember,
  }) => {
    // Use the new useProfiles hook for batch fetching with caching
    const {
      isLoading: profilesLoading,
      getProfile,
      error: profilesError,
    } = useProfiles(members, { staleTime: 5 * 60 * 1000 });

    // Add observability tracking - TEMPORARILY DISABLED
    const { trackMemberAction, trackError } = usePodObservability({
      podId: podId || '',
      userAddress,
      enabled: false, // Temporarily disabled to fix recursion
    });

    // Memoize members array comparison to prevent unnecessary re-renders
    const stableMembers = React.useMemo(() => members, [members.join(',')]);

    // ✅ ISSUE #7: Helper to find memberRef by address
    const getMemberRef = React.useCallback(
      (address: string) => {
        return memberRefs.find(
          (ref) => ref.wallet.toLowerCase() === address.toLowerCase(),
        );
      },
      [memberRefs],
    );

    // Combine loading states
    const isLoading = loading || profilesLoading;

    // Enhanced event handler with tracking - must be defined before useMemo
    const handleClickName = React.useCallback(
      (address: string) => {
        trackMemberAction('view_profile', { memberAddress: address });
        onClickName(address);
      },
      [onClickName, trackMemberAction],
    );

    // Memoize the rendered member cards with enhanced handlers
    const memberCards = React.useMemo(() => {
      if (isLoading) return null;

      return stableMembers.map((member) => {
        const profile = getProfile(member);
        const memberRef = getMemberRef(member); // ✅ ISSUE #7: Get full member data
        const isLeader = leaders.some(
          (leader) => leader.toLowerCase() === member.toLowerCase(),
        );

        return (
          <MemberCard
            key={member}
            address={member}
            profile={profile}
            memberRef={memberRef}
            podId={podId}
            podName={podName}
            onClickName={handleClickName}
            role={isLeader ? 'leader' : 'member'}
            isLeader={isLeader}
            canRemove={!!onRemoveMember}
            isCurrentUser={member.toLowerCase() === userAddress?.toLowerCase()}
            onRemoveMember={onRemoveMember}
            podLeaders={leaders}
            currentUserAddress={userAddress}
          />
        );
      });
    }, [
      stableMembers,
      isLoading,
      getProfile,
      getMemberRef,
      podId,
      podName,
      handleClickName,
      leaders,
      onRemoveMember,
      userAddress,
    ]);

    // Track errors
    React.useEffect(() => {
      if (profilesError) {
        trackError(profilesError, {
          context: 'member_profiles',
          memberCount: members.length,
        });
      }
    }, [profilesError, trackError, members.length]);

    // Error state - preserves existing UX
    if (profilesError && !isLoading) {
      return (
        <MemberLoadingError
          error={profilesError}
          onRetry={() => {
            trackMemberAction('retry_member_load');
            // Profiles will be automatically refetched by the ProfilesProvider
          }}
        />
      );
    }

    // Loading state
    if (isLoading) {
      return <AdaptiveMemberListSkeleton addresses={members} />;
    }

    // Empty state
    if (members.length === 0) {
      return <EmptyMembersList type="members" showRefreshHint={true} />;
    }

    return <div className="space-y-3">{memberCards}</div>;
  },
);

CurrentMembersList.displayName = 'CurrentMembersList';

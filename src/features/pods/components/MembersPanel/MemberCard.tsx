/**
 * MemberCard - Optimized individual member display component
 * 
 * Extracted common member display logic with proper memoization
 * to prevent unnecessary re-renders when parent lists change.
 */

'use client';

import React from 'react';
import { User, UserMinus, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { displayName } from '../../../identity/utils/displayName';
import type { UserProfile } from '../../../identity/types';
import type { MemberRef } from '../../types';
import { RemoveMemberButton } from './RemoveMemberButton';

interface MemberCardProps {
  address: string;
  profile: UserProfile | null;
  memberRef?: MemberRef; // ✅ ISSUE #7: Full member data for removal
  podId?: string; // ✅ ISSUE #7: Pod ID for removal
  podName?: string; // ✅ ISSUE #7: Pod name for removal
  onClickName?: (address: string) => void; // Made optional
  className?: string;
  role?: 'leader' | 'member' | 'admin';
  isLeader?: boolean; // Helper prop to identify if this person is a pod leader
  canRemove?: boolean; // Whether the current user can remove this member
  isCurrentUser?: boolean; // Whether this card represents the current user
  onRemoveMember?: (address: string, requiresVote: boolean) => void;
  podLeaders?: string[]; // List of pod leaders for permission checks
  currentUserAddress?: string; // Current user's address for permission checks
  showRole?: boolean; // Whether to show the role badge
  size?: 'sm' | 'md' | 'lg'; // Size variant
}

/**
 * Memoized member card component that only re-renders when props actually change
 */
export const MemberCard = React.memo<MemberCardProps>(({
  address,
  profile,
  memberRef, // ✅ ISSUE #7: Full member data
  podId, // ✅ ISSUE #7
  podName, // ✅ ISSUE #7
  onClickName,
  className = "flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50",
  role,
  isLeader = false,
  canRemove = false,
  isCurrentUser = false,
  onRemoveMember,
  podLeaders = [],
  currentUserAddress
}) => {

  // Memoize display name calculation
  const memberDisplayName = React.useMemo(
    () => displayName(profile, address),
    [profile, address]
  );

  // Memoized event handler for name click
  const handleClickName = React.useCallback(() => {
    if (onClickName) {
      onClickName(address);
    }
  }, [onClickName, address]);

  // Determine if removal requires a vote
  const requiresVote = React.useMemo(() => {
    // Leader removal requires vote, member removal can be direct
    return isLeader;
  }, [isLeader]);

  // Check if current user is a leader (for permission checks)
  const currentUserIsLeader = React.useMemo(() => {
    return currentUserAddress && podLeaders.includes(currentUserAddress.toLowerCase());
  }, [currentUserAddress, podLeaders]);

  // Memoized event handler for remove action
  const handleRemoveMember = React.useCallback(() => {
    if (onRemoveMember) {
      onRemoveMember(address, requiresVote);
    }
  }, [onRemoveMember, address, requiresVote]);

  // Determine if remove button should be shown
  const showRemoveButton = React.useMemo(() => {
    return canRemove && onRemoveMember && currentUserIsLeader && !isCurrentUser;
  }, [canRemove, onRemoveMember, currentUserIsLeader, isCurrentUser]);

  return (
    <div className={className}>
      <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden border border-gray-200">
        {profile?.profile_picture ? (
          <img 
            src={profile.profile_picture} 
            alt={profile?.first_name || 'Profile'} 
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`w-6 h-6 text-gray-400 ${profile?.profile_picture ? 'hidden' : ''}`}>
          <User className="w-6 h-6" />
        </div>
      </div>
      
      <div className="flex-1">
        {/* Name Display - Full First and Last Name, Clickable for Modal */}
        <div
          className="cursor-pointer transition-colors hover:opacity-80"
          style={{ color: '#2F5D50' }}
          onClick={handleClickName}
        >
          {profile?.first_name || profile?.last_name ? (
            <div className="flex items-center space-x-1">
              {profile.first_name && (
                <span className="font-medium text-gray-700">
                  {profile.first_name}
                </span>
              )}
              {profile.last_name && (
                <span className="text-gray-700">
                  {profile.last_name}
                </span>
              )}
            </div>
          ) : (
            <span className="font-medium text-gray-500 italic">No Name</span>
          )}
        </div>
      </div>

      {/* Remove Button - Only show for leaders removing others */}
      {showRemoveButton && (
        <div className="flex items-center space-x-2">
          {/* ✅ ISSUE #7: Use RemoveMemberButton if we have full member data */}
          {memberRef?.id && memberRef?.hat_id && podId && podName ? (
            <RemoveMemberButton
              memberId={memberRef.id}
              memberAddress={address}
              memberName={memberDisplayName}
              hatId={memberRef.hat_id}
              podId={podId}
              podName={podName}
              membershipType={isLeader ? 'leader' : 'member'}
              onSuccess={() => {
                // Optionally call legacy onRemoveMember for backward compatibility
                onRemoveMember?.(address, requiresVote);
              }}
            />
          ) : (
            /* Fallback to simple button if data unavailable */
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveMember}
              className="hover:opacity-90"
              style={{ color: '#8B3A3A', borderColor: '#D9B3B3', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F5E6E6'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {requiresVote ? (
                <>
                  <Vote className="w-4 h-4 mr-1" />
                  Vote to Remove
                </>
              ) : (
                <>
                  <UserMinus className="w-4 h-4 mr-1" />
                  Remove
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
});

MemberCard.displayName = 'MemberCard';
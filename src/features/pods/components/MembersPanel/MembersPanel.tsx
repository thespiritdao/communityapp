'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import { PodLeadersList } from './PodLeadersList';
import { CurrentMembersList } from './CurrentMembersList';
import { AddMemberModal } from './AddMemberModal';

interface Pod {
  pod_leads?: string[];
  [key: string]: any;
}

interface MembersPanelProps {
  leaders: string[];
  members: string[];
  memberRefs?: import('../../types').MemberRef[]; // ✅ ISSUE #7: Full member data for removal
  loading: boolean;
  onClickName: (address: string) => void;
  podId?: string;
  podName?: string; // ✅ ISSUE #7: Pod name for removal notifications
  userAddress?: string;
  onRemoveMember?: (address: string, requiresVote: boolean) => void;
  canManageMembers?: boolean; // Whether current user can add/manage members
}

export const MembersPanel: React.FC<MembersPanelProps> = ({
  leaders,
  members,
  memberRefs = [], // ✅ ISSUE #7: Default to empty array
  loading,
  onClickName,
  podId,
  podName,
  userAddress,
  onRemoveMember,
  canManageMembers = false,
}) => {
  const [showAddMemberModal, setShowAddMemberModal] = React.useState(false);

  // Memoize existing members to prevent unnecessary re-renders in AddMemberModal
  const existingMembers = useMemo(() => {
    return [...leaders, ...members];
  }, [leaders, members]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center space-x-3">
              <span className="text-xl font-semibold">Leaders</span>
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                {leaders.length}
              </span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PodLeadersList
            leaders={leaders}
            onClickName={onClickName}
            podId={podId}
            podName={podName}
            userAddress={userAddress}
            memberRefs={memberRefs}
            onRemoveMember={onRemoveMember}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <div className="flex items-center space-x-3">
              <span className="text-xl font-semibold">Members</span>
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full mr-2">
                {members.length}
              </span>
            </div>
            {canManageMembers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddMemberModal(true)}
                className="flex items-center space-x-1"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add</span>
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CurrentMembersList
            members={members}
            onClickName={onClickName}
            loading={loading}
            podId={podId}
            podName={podName}
            userAddress={userAddress}
            leaders={leaders}
            memberRefs={memberRefs}
            onRemoveMember={onRemoveMember}
          />
        </CardContent>
      </Card>

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          podId={podId || ''}
          existingMembers={existingMembers}
          currentUserAddress={userAddress}
        />
      )}
    </div>
  );
};

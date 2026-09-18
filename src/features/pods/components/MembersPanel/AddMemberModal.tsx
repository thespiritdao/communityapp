'use client';

import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Search, User, Send, X, Users, Crown } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import type { UserProfile } from '@/features/identity/types';
import { MemberCard } from './MemberCard';

type InvitationRole = 'member' | 'leader';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  podId: string;
  existingMembers: string[]; // List of addresses already in the pod
  currentUserAddress?: string;
}

interface UserOption {
  address: string;
  profile: UserProfile;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  isOpen,
  onClose,
  podId,
  existingMembers,
  currentUserAddress,
}) => {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [selectedRole, setSelectedRole] = useState<InvitationRole>('member');
  const [memberRoleExists, setMemberRoleExists] = useState<boolean | null>(
    null,
  );
  const [checkingRole, setCheckingRole] = useState(false);
  const { toast } = useToast();

  // Handler to open identity modal
  const handleClickName = (address: string) => {
    router.push(`/identity?address=${address}`);
  };

  // ✅ ISSUE #2 FIX: Check if member role exists when modal opens
  useEffect(() => {
    const checkMemberRole = async () => {
      if (!isOpen || !podId) return;

      try {
        setCheckingRole(true);
        const { data: pod, error } = await supabase
          .from('pods')
          .select('membership_hat_id')
          .eq('id', podId)
          .single();

        if (error) {
          console.error('Failed to check member role:', error);
          setMemberRoleExists(null);
          return;
        }

        // Check if membership_hat_id is valid (not null, not 'pending_creation', not 'null')
        const hasValidMemberRole =
          pod?.membership_hat_id &&
          pod.membership_hat_id !== 'pending_creation' &&
          pod.membership_hat_id !== 'null';

        setMemberRoleExists(hasValidMemberRole);

        console.log('🔍 Member role check:', {
          podId,
          membership_hat_id: pod?.membership_hat_id,
          hasValidMemberRole,
        });
      } catch (error) {
        console.error('Error checking member role:', error);
        setMemberRoleExists(null);
      } finally {
        setCheckingRole(false);
      }
    };

    checkMemberRole();
  }, [isOpen, podId]);

  // Fetch all users from profiles on mount
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        setLoading(true);

        const { data: profiles, error } = await supabase
          .from('public_profiles')
          .select('wallet_address, first_name, last_name, profile_picture')
          .not('wallet_address', 'is', null)
          .order('first_name', { ascending: true });

        if (error) throw error;

        const userOptions: UserOption[] = (profiles || [])
          .filter(
            (profile) =>
              // Exclude existing members and current user
              profile.wallet_address &&
              !existingMembers.includes(profile.wallet_address.toLowerCase()) &&
              profile.wallet_address.toLowerCase() !==
                currentUserAddress?.toLowerCase(),
          )
          .map((profile) => ({
            address: profile.wallet_address,
            profile: profile as UserProfile,
          }));

        setAllUsers(userOptions);
      } catch (error) {
        console.error('Failed to fetch users:', error);
        toast({
          title: 'Error',
          description: 'Failed to load users. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      fetchAllUsers();
    }
  }, [isOpen, existingMembers, currentUserAddress]); // Removed toast from deps - it's stable and doesn't need to be tracked

  // Filter users based on search term
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return allUsers.slice(0, 10); // Show first 10 if no search

    const term = searchTerm.toLowerCase();
    return allUsers
      .filter((user) => {
        const firstName = user.profile.first_name?.toLowerCase() || '';
        const lastName = user.profile.last_name?.toLowerCase() || '';
        const fullName = `${firstName} ${lastName}`.trim();

        return (
          firstName.includes(term) ||
          lastName.includes(term) ||
          fullName.includes(term) ||
          user.address.toLowerCase().includes(term)
        );
      })
      .slice(0, 10); // Limit to 10 results
  }, [allUsers, searchTerm]);

  // Handle sending invitation
  const handleSendInvite = async (user: UserOption) => {
    if (!currentUserAddress) return;

    try {
      setSendingInvite(true);

      // Get pod name for the invitation
      const { data: pod, error: podError } = await supabase
        .from('pods')
        .select('name')
        .eq('id', podId)
        .single();

      if (podError) throw podError;

      const podName = pod?.name || 'Unknown Pod';
      const userName = user.profile.first_name
        ? `${user.profile.first_name} ${user.profile.last_name || ''}`.trim()
        : `${user.address.slice(0, 8)}...${user.address.slice(-6)}`;

      // Create role-specific invitation message
      const roleLabel = selectedRole === 'leader' ? 'pod leader' : 'member';
      const invitationMessage =
        selectedRole === 'leader'
          ? `You've been invited to join "${podName}" as a pod leader. Click to view the pod and apply for leadership.`
          : `You've been invited to join "${podName}" as a member. Click to view the pod and apply for membership.`;

      // ✅ ISSUE #1 FIX: Link directly to application page for easy access
      const applicationUrl = `/pods/${podId}/applications/apply`;

      // Create invitation notification with role metadata
      await unifiedNotificationService.createNotification({
        recipient_address: user.address,
        sender_address: currentUserAddress,
        notification_type:
          selectedRole === 'leader'
            ? ('pod_leadership_invitation' as any)
            : ('pod_membership_invitation' as any),
        title: `Pod Invitation: ${podName}`,
        message: invitationMessage,
        context_type: 'governance',
        context_id: podId,
        context_url: applicationUrl, // Direct link to application page
        priority: 'medium',
        metadata: {
          invitation_type:
            selectedRole === 'leader' ? 'pod_leadership' : 'pod_membership',
          intended_role: selectedRole,
          pod_name: podName,
          invited_by: currentUserAddress,
        },
      });

      toast({
        title: 'Invitation Sent!',
        description: `Sent ${roleLabel} invitation to ${userName}. They'll receive a notification and can apply to join.`,
        duration: 5000,
      });

      onClose();
    } catch (error) {
      console.error('Failed to send invitation:', error);
      toast({
        title: 'Failed to Send Invitation',
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setSendingInvite(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Invite New Member</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Search and invite users to join this pod. They'll receive a
            notification and can apply for membership.
          </p>
        </div>

        {/* Search */}
        <div className="p-4 border-b">
          <Label htmlFor="user-search">Search Users</Label>
          <div className="relative mt-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              id="user-search"
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Role Selection */}
        <div className="p-4 border-b" style={{ backgroundColor: '#E8F1EE' }}>
          <Label className="text-sm font-medium">Invitation Role</Label>
          <p className="text-xs text-gray-600 mt-1 mb-3">
            Select the role you'd like to invite users for. They'll apply for
            this specific role.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSelectedRole('member')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all"
              style={
                selectedRole === 'member'
                  ? {
                      borderColor: '#2F5D50',
                      backgroundColor: '#E8F1EE',
                      color: '#1F453A',
                    }
                  : {
                      borderColor: '#e5e7eb',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                    }
              }
              onMouseEnter={(e) => {
                if (selectedRole !== 'member') {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedRole !== 'member') {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }
              }}
            >
              <Users className="w-4 h-4" />
              <div className="text-left">
                <div className="font-medium text-sm">Member</div>
                <div className="text-xs opacity-75">Regular pod member</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSelectedRole('leader')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all"
              style={
                selectedRole === 'leader'
                  ? {
                      borderColor: '#6A5F7A',
                      backgroundColor: '#EDEAF0',
                      color: '#4A3F5A',
                    }
                  : {
                      borderColor: '#e5e7eb',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                    }
              }
              onMouseEnter={(e) => {
                if (selectedRole !== 'leader') {
                  e.currentTarget.style.borderColor = '#d1d5db';
                }
              }}
              onMouseLeave={(e) => {
                if (selectedRole !== 'leader') {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                }
              }}
            >
              <Crown className="w-4 h-4" />
              <div className="text-left">
                <div className="font-medium text-sm">Leader</div>
                <div className="text-xs opacity-75">Pod manager/admin</div>
              </div>
            </button>
          </div>
        </div>

        {/* ✅ ISSUE #2 FIX: Warning if no member role exists */}
        {selectedRole === 'member' && memberRoleExists === false && (
          <div
            className="mx-4 mt-4 mb-0 p-4 border-l-4 rounded"
            style={{ backgroundColor: '#FAF4EC', borderColor: '#C6933F' }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <svg
                  className="w-5 h-5"
                  style={{ color: '#C6933F' }}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h4
                  className="text-sm font-semibold mb-1"
                  style={{ color: '#8F6B2F' }}
                >
                  No Member Role Created Yet
                </h4>
                <p className="text-xs mb-2" style={{ color: '#A67E35' }}>
                  This pod doesn't have a member role yet. When you approve this
                  application, you'll have the option to auto-create the member
                  role on-demand.
                </p>
                <p className="text-xs" style={{ color: '#C6933F' }}>
                  <strong>Note:</strong> The approval process will handle role
                  creation automatically. You can still send this invitation.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* User List */}
        <div className="flex-1 overflow-y-auto max-h-96">
          {loading ? (
            <div className="p-4">
              <div className="animate-pulse space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center space-x-3 p-3">
                    <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <User className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>No users found matching your search.</p>
              {searchTerm && (
                <p className="text-sm mt-1">Try a different search term.</p>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredUsers.map((user) => (
                <div key={user.address} className="relative">
                  <div className="flex items-center justify-between border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex-1">
                      <MemberCard
                        address={user.address}
                        profile={user.profile}
                        onClickName={handleClickName}
                        className="flex items-center space-x-3 p-3"
                      />
                    </div>

                    {/* Invite Button */}
                    <div className="pr-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSendInvite(user)}
                        disabled={sendingInvite}
                        className="flex items-center space-x-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Invite</span>
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50">
          <p className="text-xs text-gray-600">
            <strong>Current role:</strong>{' '}
            {selectedRole === 'leader' ? 'Pod Leader' : 'Member'}
            {' • '}
            Invited users will receive a notification and can apply for this
            role.
          </p>
        </div>
      </div>
    </div>
  );
};

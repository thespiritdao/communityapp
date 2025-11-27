'use client';

import { useAccount } from 'wagmi';
import { useToast } from '@/components/ui/use-toast';
import { PodManagementContainer } from '@/features/pods/components';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import type { Pod } from '@/features/pods/types';
import type { UserProfile } from '@/features/identity/types';

interface PodManageClientProps {
  initialPod: Pod | null;
  initialLeaderProfiles: Record<string, UserProfile>;
  podId: string;
}

/**
 * Client component that uses the robust PodManagementContainer
 * Provides full pod management functionality including:
 * - Member management with role editing
 * - HAT minting and deactivation
 * - Image upload and metadata editing
 * - Advanced settings and permissions
 * - Treasury management
 */
export function PodManageClient({
  initialPod,
  initialLeaderProfiles,
  podId,
}: PodManageClientProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const { selectedUser, users, isOpen, openProfileModal, closeProfileModal } =
    useProfileModal();

  console.log(
    '🔄 PodManageClient: Using robust management container for pod:',
    podId,
  );

  // Create a handler that opens the profile modal instead of navigating
  const handleClickName = (userAddress: string) => {
    openProfileModal(userAddress);
  };

  return (
    <div className="container mx-auto px-4 py-8 bottom-nav-spacing-large">
      <PodManagementContainer
        podId={podId}
        userAddress={address}
        toast={toast}
        onClickName={handleClickName}
      />

      {isOpen && selectedUser && (
        <ProfileModal
          user={selectedUser}
          users={users}
          onClose={closeProfileModal}
        />
      )}
    </div>
  );
}

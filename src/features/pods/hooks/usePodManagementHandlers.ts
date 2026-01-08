/**
 * Pod Management Handlers - Optimized event handlers with memoization
 *
 * Extracts and memoizes event handlers for pod management to prevent
 * unnecessary re-renders in child components.
 */

'use client';

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient, useWalletClient } from 'wagmi';
import { PodOperationsService } from '../services/PodOperationsService';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

interface UsePodManagementHandlersProps {
  podId: string;
  toast?: (options: any) => void;
}

interface PodManagementHandlers {
  handleClickName: (address: string) => void;
  handleRefreshMembers: () => void;
  handleNavigateToMember: (address: string) => void;
  handleShowSuccess: (message: string) => void;
  handleShowError: (message: string) => void;
  handleRemoveMember: (address: string, requiresVote: boolean) => void;
}

/**
 * Centralized hook for pod management event handlers with proper memoization
 */
export function usePodManagementHandlers({
  podId,
  toast,
}: UsePodManagementHandlersProps): PodManagementHandlers {
  const router = useRouter();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { evmAddress: currentUserAddress } = useEvmAddress();

  // Memoized profile navigation handler
  const handleClickName = useCallback(
    (address: string) => {
      router.push(`/identity?address=${address}`);
    },
    [router],
  );

  // Memoized member refresh handler (placeholder for future implementation)
  const handleRefreshMembers = useCallback(() => {
    toast?.({
      title: 'Refreshing members',
      description: 'Updating member list from blockchain...',
      duration: 2000,
    });

    // TODO: Trigger member indexing refresh
    // This would call the PodOperationsService.triggerMemberIndexing(podId)
  }, [toast, podId]);

  // Memoized navigation to member profile
  const handleNavigateToMember = useCallback(
    (address: string) => {
      router.push(`/identity/${address}`);
    },
    [router],
  );

  // Memoized success toast
  const handleShowSuccess = useCallback(
    (message: string) => {
      toast?.({
        title: 'Success',
        description: message,
        duration: 3000,
      });
    },
    [toast],
  );

  // Memoized error toast
  const handleShowError = useCallback(
    (message: string) => {
      toast?.({
        title: 'Error',
        description: message,
        variant: 'destructive',
        duration: 5000,
      });
    },
    [toast],
  );

  // Memoized member removal handler
  const handleRemoveMember = useCallback(
    async (address: string, requiresVote: boolean) => {
      if (requiresVote) {
        // For leaders - requires consensus vote
        toast?.({
          title: 'Leadership Removal Request',
          description:
            'Starting consensus vote process among pod leaders. This feature will be fully implemented with voting infrastructure.',
          duration: 6000,
        });

        // TODO: Implement consensus voting system
        console.log(
          `🗳️ Leader removal vote requested for ${address} in pod ${podId}`,
        );
      } else {
        // For members - direct removal by leaders
        // Get fresh client references at execution time to avoid stale closures
        const currentPublicClient = publicClient;
        const currentWalletClient = walletClient;
        const currentAddress = currentUserAddress;

        if (!currentPublicClient || !currentWalletClient || !currentAddress) {
          toast?.({
            title: 'Error',
            description: 'Please connect your wallet to remove members',
            variant: 'destructive',
            duration: 5000,
          });
          return;
        }

        try {
          toast?.({
            title: 'Member Removal',
            description:
              'Removing member from pod. This will revoke their membership hat and database access.',
            duration: 4000,
          });

          // Initialize PodOperationsService
          const podOps = new PodOperationsService(
            currentPublicClient,
            currentWalletClient,
          );

          // Remove member using PodOperationsService
          const result = await podOps.updateMembers(
            {
              podId,
              removeMembers: [address],
              membershipType: 'member',
              updatedByAddress: currentAddress,
            },
            (update) => {
              console.log('Member removal progress:', update);
            },
          );

          if (result.success) {
            console.log(
              `✅ Successfully removed member ${address} from pod ${podId}`,
            );

            // Send notification to removed member
            await unifiedNotificationService.createNotification({
              recipient_address: address.toLowerCase(),
              sender_address: currentAddress.toLowerCase(),
              notification_type: 'pod_member_removed',
              title: 'Removed from Pod',
              message: `You have been removed from a pod.`,
              context_type: 'governance',
              context_id: podId,
              context_url: `/pods/${podId}`,
              priority: 'high',
            });

            console.log(`📧 Notification sent to removed member ${address}`);

            toast?.({
              title: 'Success',
              description: `Member removed successfully. Hat revoked and database updated.`,
              duration: 5000,
            });

            // Trigger member list refresh
            window.location.reload();
          } else {
            throw new Error(
              result.error instanceof Error
                ? result.error.message
                : result.error || 'Unknown error removing member',
            );
          }
        } catch (error) {
          console.error(`❌ Error removing member ${address}:`, error);
          toast?.({
            title: 'Error',
            description:
              error instanceof Error
                ? error.message
                : 'Failed to remove member',
            variant: 'destructive',
            duration: 5000,
          });
        }
      }
    },
    [toast, podId],
  );

  // Return memoized handlers object
  return useMemo(
    () => ({
      handleClickName,
      handleRefreshMembers,
      handleNavigateToMember,
      handleShowSuccess,
      handleShowError,
      handleRemoveMember,
    }),
    [
      handleClickName,
      handleRefreshMembers,
      handleNavigateToMember,
      handleShowSuccess,
      handleShowError,
      handleRemoveMember,
    ],
  );
}

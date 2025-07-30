import { useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { governanceNotificationService } from '../../../utils/governanceNotificationService';

export function useGovernanceNotifications() {
  const { address } = useAccount();

  const { data: unreadCount = 0, isLoading } = useQuery({
    queryKey: ['governance-notifications-votable', address],
    queryFn: async () => {
      if (!address) return 0;
      return await governanceNotificationService.getUnreadNotificationCountForVotableProposals(address);
    },
    enabled: !!address,
    staleTime: 30000, // 30 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['governance-notifications-list-votable', address],
    queryFn: async () => {
      if (!address) return [];
      return await governanceNotificationService.getUnreadNotificationsForVotableProposals(address.toLowerCase());
    },
    enabled: !!address,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  return {
    unreadCount,
    notifications,
    isLoading: isLoading || notificationsLoading,
  };
} 
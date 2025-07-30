import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { governanceNotificationService, GovernanceNotification } from '../utils/governanceNotificationService';
import { supabase } from '../utils/supabaseClient';
import { usePathname } from 'next/navigation';

interface GovernanceNotificationContextType {
  notifications: GovernanceNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  createProposalMentionNotification: (
    recipientAddress: string,
    senderAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ) => Promise<void>;
  createProposalCreatedNotification: (
    proposerAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ) => Promise<void>;
}

const GovernanceNotificationContext = createContext<GovernanceNotificationContextType | null>(null);

export const useGovernanceNotifications = () => {
  const context = useContext(GovernanceNotificationContext);
  if (!context) {
    throw new Error('useGovernanceNotifications must be used within a GovernanceNotificationProvider');
  }
  return context;
};

interface GovernanceNotificationProviderProps {
  children: React.ReactNode;
}

export const GovernanceNotificationProvider: React.FC<GovernanceNotificationProviderProps> = ({ children }) => {
  const { address } = useAccount();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<GovernanceNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);

      const lowerAddress = address.toLowerCase();
      
      // Use the most advanced filtering: active proposals that user hasn't voted on
      const [votableNotifications, votableCount] = await Promise.all([
        governanceNotificationService.getUnreadNotificationsForVotableProposals(lowerAddress),
        governanceNotificationService.getUnreadNotificationCountForVotableProposals(lowerAddress)
      ]);

      setNotifications(votableNotifications);
      setUnreadCount(votableCount);

    } catch (err) {
      console.error('🔔 Error refreshing governance notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load governance notifications');
    } finally {
      setLoading(false);
    }
  }, [address]);

  const markAsRead = useCallback(async (id: string) => {
    try {
      await governanceNotificationService.markNotificationAsRead(id);
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => 
          notification.id === id 
            ? { ...notification, is_read: true }
            : notification
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking governance notification as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark governance notification as read');
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!address) return;

    try {
      await governanceNotificationService.markAllNotificationsAsRead(address);
      
      // Update local state
      setNotifications(prev => 
        prev.map(notification => ({ ...notification, is_read: true }))
      );
      
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all governance notifications as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark governance notifications as read');
    }
  }, [address]);

  const createProposalMentionNotification = useCallback(async (
    recipientAddress: string,
    senderAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ) => {
    try {
      const newNotification = await governanceNotificationService.createProposalMentionNotification(
        recipientAddress.toLowerCase(),
        senderAddress.toLowerCase(),
        proposalId,
        proposalTitle,
        transactionHash
      );

      // If this notification is for the current user, add it to the list
      if (address && address.toLowerCase() === recipientAddress.toLowerCase()) {
        setNotifications(prev => [newNotification, ...prev]);
        setUnreadCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error creating proposal mention notification:', err);
      setError(err instanceof Error ? err.message : 'Failed to create governance notification');
    }
  }, [address]);

  const createProposalCreatedNotification = useCallback(async (
    proposerAddress: string,
    proposalId: string,
    proposalTitle: string,
    transactionHash?: string
  ) => {
    try {
      const newNotification = await governanceNotificationService.createProposalCreatedNotification(
        proposerAddress.toLowerCase(),
        proposalId,
        proposalTitle,
        transactionHash
      );

      // If this notification is for the current user, add it to the list
      if (address && address.toLowerCase() === proposerAddress.toLowerCase()) {
        setNotifications(prev => [newNotification, ...prev]);
        setUnreadCount(prev => prev + 1);
      }
    } catch (err) {
      console.error('Error creating proposal created notification:', err);
      setError(err instanceof Error ? err.message : 'Failed to create governance notification');
    }
  }, [address]);

  // Load notifications when address changes
  useEffect(() => {
    if (address) {
      console.log('🔔 Setting up notifications for address:', address.toLowerCase());
      refreshNotifications();
    } else {
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [address, refreshNotifications]);

  // Add effect to refresh notifications on every route change
  useEffect(() => {
    if (address) {
      refreshNotifications();
    }
  }, [pathname, address, refreshNotifications]);

  // Add periodic refresh every 30 seconds
  useEffect(() => {
    if (!address) return;
    
    const interval = setInterval(() => {
      refreshNotifications();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [address, refreshNotifications]);

  // Set up real-time subscription for new governance notifications
  useEffect(() => {
    if (!address) return;

    const lowerAddress = address.toLowerCase();
    // Setting up governance notification subscription

    const channel = supabase
      .channel('governance-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'governance_notifications',
          filter: `recipient_address=eq.${lowerAddress}`
        },
        (payload) => {
          // Add this log:
          console.log('🔔 Real-time notification received:', payload);
          // Governance notification realtime event received
          const newNotification = payload.new as GovernanceNotification;
          setNotifications(prev => [newNotification, ...prev]);
          if (!newNotification.is_read) {
            // Incrementing unread count for new notification
            setUnreadCount(prev => {
              const newCount = prev + 1;
              console.log('🔔 Updated unread count:', newCount);
              return newCount;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('🔔 Governance notification subscription status:', status);
      });

    return () => {
      console.log('🔔 Unsubscribing from governance notifications');
      channel?.unsubscribe();
    };
  }, [address]);

  const value: GovernanceNotificationContextType = {
    notifications,
    unreadCount,
    loading,
    error,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    createProposalMentionNotification,
    createProposalCreatedNotification
  };

  return (
    <GovernanceNotificationContext.Provider value={value}>
      {children}
    </GovernanceNotificationContext.Provider>
  );
}; 
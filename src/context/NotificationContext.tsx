import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { notificationService, GeneralNotification } from '../utils/notificationService';
import { supabase } from '../utils/supabaseClient';
import { usePathname } from 'next/navigation';

interface NotificationContextType {
  notifications: GeneralNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  createUserMentionNotification: (
    recipientAddress: string,
    senderAddress: string,
    contextType: 'forum' | 'chat' | 'bounty',
    contextId: string,
    contextUrl?: string
  ) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

interface NotificationProviderProps {
  children: React.ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const { address } = useAccount();
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<GeneralNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      setError(null);

      const [notificationsData, count] = await Promise.all([
        notificationService.getNotificationsForUser(address),
        notificationService.getUnreadNotificationCount(address)
      ]);

      console.log('Refreshing notifications:', {
        totalNotifications: notificationsData.length,
        unreadCount: count,
        notifications: notificationsData
      });

      setNotifications(notificationsData);
      setUnreadCount(count);
    } catch (err) {
      console.error('Error refreshing notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [address]);

  const markAsRead = useCallback(async (id: string) => {
    console.log('Marking notification as read:', id);
    
    try {
      await notificationService.markNotificationAsRead(id);
      console.log('Successfully marked notification as read in database');
      
      // Update local state
      setNotifications(prev => {
        const updated = prev.map(notification => 
          notification.id === id 
            ? { ...notification, is_read: true }
            : notification
        );
        console.log('Updated local notifications state');
        return updated;
      });
      
      setUnreadCount(prev => {
        const newCount = Math.max(0, prev - 1);
        console.log('Updated unread count from', prev, 'to', newCount);
        return newCount;
      });
    } catch (err) {
      console.error('Error marking notification as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!address) return;
    
    console.log('Marking all notifications as read for:', address);

    try {
      await notificationService.markAllNotificationsAsRead(address);
      console.log('Successfully marked all notifications as read in database');
      
      // Update local state
      setNotifications(prev => {
        const updated = prev.map(notification => ({ ...notification, is_read: true }));
        console.log('Updated all notifications to read in local state');
        return updated;
      });
      
      setUnreadCount(0);
      console.log('Set unread count to 0');
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark notifications as read');
    }
  }, [address]);

  const createUserMentionNotification = useCallback(async (
    recipientAddress: string,
    senderAddress: string,
    contextType: 'forum' | 'chat' | 'bounty',
    contextId: string,
    contextUrl?: string
  ) => {
    console.log('NotificationContext: Creating mention notification', {
      recipientAddress,
      senderAddress,
      contextType,
      contextId,
      contextUrl
    });

    try {
      console.log('NotificationContext: About to call notificationService.createUserMentionNotification');
      
      const newNotification = await notificationService.createUserMentionNotification(
        recipientAddress.toLowerCase(),
        senderAddress.toLowerCase(),
        contextType,
        contextId,
        contextUrl
      );

      console.log('NotificationContext: Notification created successfully:', newNotification);
      console.log('NotificationContext: Waiting for realtime subscription to update UI...');

      // Don't manually add to state - let realtime subscription handle it
      // This prevents duplicate notifications and ensures proper data flow
    } catch (err) {
      console.error('NotificationContext: Error creating user mention notification:', err);
      console.error('NotificationContext: Error type:', typeof err);
      console.error('NotificationContext: Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      setError(err instanceof Error ? err.message : 'Failed to create notification');
    }
  }, [address]);

  // Load notifications when address changes
  useEffect(() => {
    if (address) {
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

  // Set up real-time subscription for new notifications
  useEffect(() => {
    if (!address) return;

    const lowerAddress = address.toLowerCase();
    console.log('Setting up realtime subscription for address:', lowerAddress);

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'general_notifications',
          filter: `recipient_address=eq.${lowerAddress}`
        },
        (payload) => {
          console.log('Realtime notification INSERT received:', payload.new);
          const newNotification = payload.new as GeneralNotification;
          setNotifications(prev => [newNotification, ...prev]);
          if (!newNotification.is_read) {
            setUnreadCount(prev => prev + 1);
            console.log('Incremented unread count due to new notification');
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'general_notifications',
          filter: `recipient_address=eq.${lowerAddress}`
        },
        (payload) => {
          console.log('Realtime notification UPDATE received:', payload.new);
          const updatedNotification = payload.new as GeneralNotification;
          
          setNotifications(prev => prev.map(notification => 
            notification.id === updatedNotification.id ? updatedNotification : notification
          ));
          
          // If notification was marked as read, decrement unread count
          if (updatedNotification.is_read && payload.old && !payload.old.is_read) {
            setUnreadCount(prev => Math.max(0, prev - 1));
            console.log('Decremented unread count due to notification marked as read');
          }
        }
      )
      .subscribe();

    return () => {
      channel?.unsubscribe();
    };
  }, [address]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    loading,
    error,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
    createUserMentionNotification
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}; 
// src/context/UnifiedNotificationContext.tsx

import type React from 'react';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { 
  unifiedNotificationService, 
  type UnifiedNotification, 
  type NotificationCategory,
  type CreateUnifiedNotificationData 
} from '@/services/unifiedNotificationService';
import { supabase } from '@/utils/supabaseClient';

interface UnifiedNotificationContextType {
  notifications: UnifiedNotification[];
  unreadCounts: {
    total: number;
    general: number;
    governance: number;
    events: number;
    marketplace: number;
  };
  loading: boolean;
  error: string | null;
  
  // Filters
  selectedCategory: NotificationCategory | 'all';
  
  // Actions
  refreshNotifications: () => Promise<void>;
  setSelectedCategory: (category: NotificationCategory | 'all') => void;
  markAsRead: (notificationId: string, category: NotificationCategory) => Promise<void>;
  markAllAsRead: (category?: NotificationCategory) => Promise<void>;
  createNotification: (data: CreateUnifiedNotificationData) => Promise<UnifiedNotification>;
  
  // Real-time subscriptions
  subscribeToUpdates: () => () => void;
}

const UnifiedNotificationContext = createContext<UnifiedNotificationContextType | null>(null);

export const useUnifiedNotifications = () => {
  const context = useContext(UnifiedNotificationContext);
  if (!context) {
    throw new Error('useUnifiedNotifications must be used within a UnifiedNotificationProvider');
  }
  return context;
};

interface UnifiedNotificationProviderProps {
  children: React.ReactNode;
}

export const UnifiedNotificationProvider: React.FC<UnifiedNotificationProviderProps> = ({ children }) => {
  const { address } = useAccount();
  
  // State
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [unreadCounts, setUnreadCounts] = useState({
    total: 0,
    general: 0,
    governance: 0,
    events: 0,
    marketplace: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAddress, setLastLoadedAddress] = useState<string | null>(null);
  const [refreshTimeout, setRefreshTimeout] = useState<NodeJS.Timeout | null>(null);
  const [recentlyClearedIds, setRecentlyClearedIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');

  /**
   * Refresh notifications and unread counts
   */
  const refreshNotifications = useCallback(async () => {
    if (!address) {
      setNotifications([]);
      setUnreadCounts({ total: 0, general: 0, governance: 0, events: 0, marketplace: 0 });
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch unread notifications by default to avoid showing cleared notifications
      const [notificationsData, countsData] = await Promise.all([
        unifiedNotificationService.getAllNotificationsForUser(address, {
          category: undefined, // Always fetch all categories
          unreadOnly: true // Only fetch unread notifications to prevent cleared ones from reappearing
        }),
        unifiedNotificationService.getUnreadCount(address)
      ]);

      // Filter out recently cleared notifications to prevent them from reappearing
      const filteredNotifications = notificationsData.filter(n => !recentlyClearedIds.has(n.id));
      
      setNotifications(filteredNotifications);
      setUnreadCounts(countsData);
      setLastLoadedAddress(address);

      console.log('📬 Unified notifications refreshed:', {
        total: notificationsData.length,
        filtered: filteredNotifications.length,
        recentlyCleared: recentlyClearedIds.size,
        unread: countsData.total,
        address
      });

    } catch (err) {
      console.error('Failed to refresh unified notifications:', err);
      setError(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [address]);

  /**
   * Debounced refresh to avoid rapid refreshes from real-time updates
   * Only refreshes if user is not actively viewing notifications
   */
  const debouncedRefresh = useCallback(() => {
    // Check if user is currently on notifications page - if so, don't auto-refresh
    // This prevents cleared notifications from reappearing due to new notifications
    if (typeof window !== 'undefined' && window.location.pathname === '/notifications') {
      console.log('🚫 Skipping auto-refresh while user is viewing notifications page');
      return;
    }
    
    // Simple debounce using setTimeout to avoid rapid consecutive refreshes
    setTimeout(() => {
      refreshNotifications();
    }, 300);
  }, [refreshNotifications]);

  /**
   * Mark notification as read
   */
  const markAsRead = useCallback(async (notificationId: string, category: NotificationCategory) => {
    try {
      await unifiedNotificationService.markAsRead(notificationId, category);
      
      // Add to recently cleared IDs to prevent reappearance
      setRecentlyClearedIds(prev => new Set(prev).add(notificationId));
      
      // Remove notification from local state (it's marked as read in DB)
      setNotifications(prev => 
        prev.filter(notification => notification.id !== notificationId)
      );
      
      // Update unread counts
      setUnreadCounts(prev => ({
        total: Math.max(0, prev.total - 1),
        general: category === 'general' ? Math.max(0, prev.general - 1) : prev.general,
        governance: category === 'governance' ? Math.max(0, prev.governance - 1) : prev.governance,
        events: category === 'events' ? Math.max(0, prev.events - 1) : prev.events,
        marketplace: category === 'marketplace' ? Math.max(0, prev.marketplace - 1) : prev.marketplace
      }));

      console.log(`✅ Marked notification ${notificationId} as read`);
      
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark notification as read');
    }
  }, []);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async (category?: NotificationCategory) => {
    if (!address) return;

    try {
      console.log(`📝 Marking all ${category || 'all'} notifications as read for ${address}`);
      
      // First update the database and wait for confirmation
      await unifiedNotificationService.markAllAsRead(address, category);
      
      // Add cleared notification IDs to recently cleared set
      const idsToAdd = category 
        ? notifications.filter(n => n.category === category).map(n => n.id)
        : notifications.map(n => n.id);
      
      setRecentlyClearedIds(prev => {
        const newSet = new Set(prev);
        idsToAdd.forEach(id => newSet.add(id));
        return newSet;
      });
      
      // Remove cleared notifications from local state (they're marked as read in DB)
      if (category) {
        // Remove notifications of the specified category
        setNotifications(prev => 
          prev.filter(notification => notification.category !== category)
        );
        
        setUnreadCounts(prev => ({
          ...prev,
          [category]: 0,
          total: Math.max(0, prev.total - prev[category])
        }));
      } else {
        // Clear all notifications
        setNotifications([]);
        setUnreadCounts({ total: 0, general: 0, governance: 0, events: 0, marketplace: 0 });
      }

      console.log(`✅ Successfully marked all ${category || 'all'} notifications as read`);
      
    } catch (err) {
      console.error('❌ Failed to mark all notifications as read:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark all notifications as read');
      
      // Show error to user and refresh to get accurate state
      alert(`Failed to clear notifications: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      // Refresh to get accurate state from database
      await refreshNotifications();
    }
  }, [address, notifications]);

  /**
   * Create a new notification
   */
  const createNotification = useCallback(async (data: CreateUnifiedNotificationData): Promise<UnifiedNotification> => {
    try {
      const newNotification = await unifiedNotificationService.createNotification(data);
      
      // Add to local state if it's for the current user
      if (data.recipient_address.toLowerCase() === address?.toLowerCase()) {
        setNotifications(prev => [newNotification, ...prev]);
        
        const category = newNotification.category;
        setUnreadCounts(prev => ({
          total: prev.total + 1,
          general: category === 'general' ? prev.general + 1 : prev.general,
          governance: category === 'governance' ? prev.governance + 1 : prev.governance,
          events: category === 'events' ? prev.events + 1 : prev.events,
          marketplace: category === 'marketplace' ? prev.marketplace + 1 : prev.marketplace
        }));
      }
      
      return newNotification;
    } catch (err) {
      console.error('Failed to create notification:', err);
      throw err;
    }
  }, [address]);

  /**
   * Subscribe to real-time notification updates
   */
  const subscribeToUpdates = useCallback(() => {
    if (!address) {
      return () => {};
    }

    console.log('🔴 Subscribing to real-time notification updates for:', address);

    const subscriptions = [
      // General notifications
      supabase
        .channel(`general_notifications:${address}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'general_notifications',
          filter: `recipient_address=eq.${address.toLowerCase()}`
        }, (payload) => {
          console.log('📬 Real-time general notification update:', payload);
          // Only refresh if it's a new notification (INSERT event)
          if (payload.eventType === 'INSERT') {
            // Use debounced refresh to avoid rapid refreshes
            debouncedRefresh();
          }
        })
        .subscribe(),

      // Governance notifications
      supabase
        .channel(`governance_notifications:${address}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'governance_notifications',
          filter: `recipient_address=eq.${address.toLowerCase()}`
        }, (payload) => {
          console.log('🏛️ Real-time governance notification update:', payload);
          // Only refresh if it's a new notification (INSERT event)
          if (payload.eventType === 'INSERT') {
            // Use debounced refresh to avoid rapid refreshes
            debouncedRefresh();
          }
        })
        .subscribe(),

      // Event notifications
      supabase
        .channel(`event_notifications:${address}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'event_notifications',
          filter: `recipient_address=eq.${address.toLowerCase()}`
        }, (payload) => {
          console.log('🎉 Real-time event notification update:', payload);
          // Only refresh if it's a new notification (INSERT event)
          if (payload.eventType === 'INSERT') {
            // Use debounced refresh to avoid rapid refreshes
            debouncedRefresh();
          }
        })
        .subscribe()
    ];

    return () => {
      console.log('🔴 Unsubscribing from real-time notification updates');
      subscriptions.forEach(sub => {
        supabase.removeChannel(sub);
      });
    };
  }, [address, debouncedRefresh]);

  // Load notifications only when address actually changes
  useEffect(() => {
    // If address hasn't changed, don't refresh
    if (lastLoadedAddress && address && lastLoadedAddress.toLowerCase() === address.toLowerCase()) {
      console.log('📌 Address unchanged, skipping refresh');
      return;
    }
    
    // Only refresh if we have a new address
    if (address) {
      console.log('🔄 New address detected, loading notifications:', address);
      refreshNotifications();
    } else if (!address && lastLoadedAddress) {
      // User disconnected wallet - clear notifications and recently cleared IDs
      console.log('👋 Wallet disconnected, clearing notifications');
      setNotifications([]);
      setUnreadCounts({ total: 0, general: 0, governance: 0, events: 0, marketplace: 0 });
      setRecentlyClearedIds(new Set());
      setLastLoadedAddress(null);
    }
  }, [address, lastLoadedAddress, refreshNotifications]);

  // Set up real-time subscriptions
  useEffect(() => {
    const unsubscribe = subscribeToUpdates();
    return unsubscribe;
  }, [subscribeToUpdates]);

  // Clean up recently cleared IDs after 30 minutes to prevent memory leaks
  useEffect(() => {
    const cleanup = setInterval(() => {
      setRecentlyClearedIds(new Set());
      console.log('🧹 Cleaned up recently cleared notification IDs');
    }, 30 * 60 * 1000); // 30 minutes

    return () => clearInterval(cleanup);
  }, []);

  const contextValue: UnifiedNotificationContextType = {
    notifications,
    unreadCounts,
    loading,
    error,
    selectedCategory,
    refreshNotifications,
    setSelectedCategory,
    markAsRead,
    markAllAsRead,
    createNotification,
    subscribeToUpdates
  };

  return (
    <UnifiedNotificationContext.Provider value={contextValue}>
      {children}
    </UnifiedNotificationContext.Provider>
  );
};
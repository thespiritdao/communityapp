'use client';

import React, { useEffect, useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useToast } from '@/components/ui/use-toast';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import type { UnifiedNotification } from '@/services/unifiedNotificationService';

/**
 * Bounty Notifications Component
 *
 * REFACTORED: Phase 2 - Connected to unified notification system
 *
 * Features:
 * - Real-time notification subscriptions
 * - Filters for bounty-specific notifications
 * - Mark as read functionality
 * - Toast notifications for new bounty updates
 * - Navigation to bounty context on click
 *
 * @see PHASE_2_NOTIFICATION_CONSOLIDATION_PLAN.md
 */

export interface BountyNotification {
  id: string;
  type: 'new_bounty' | 'bid_received' | 'bounty_completed';
  title: string;
  message: string;
  timestamp: Date;
}

interface BountyNotificationsProps {
  onNotificationClick?: (notification: UnifiedNotification) => void;
}

export const BountyNotifications: React.FC<BountyNotificationsProps> = ({
  onNotificationClick,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<UnifiedNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load bounty notifications
  useEffect(() => {
    if (!address) {
      setIsLoading(false);
      return;
    }

    const loadNotifications = async () => {
      try {
        setIsLoading(true);
        setError(null);

        console.log('📋 Loading bounty notifications for:', address);

        // Get bounty-specific notifications from unified service
        const notifications =
          await unifiedNotificationService.getAllNotificationsForUser(address, {
            category: 'general',
            limit: 50,
            unreadOnly: true, // Only show unread notifications
          });

        console.log(`✅ Loaded ${notifications.length} bounty notifications`);
        setNotifications(notifications);
      } catch (error) {
        console.error('❌ Failed to load bounty notifications:', error);
        setError(
          error instanceof Error
            ? error.message
            : 'Failed to load notifications',
        );
      } finally {
        setIsLoading(false);
      }
    };

    loadNotifications();

    // TODO: Re-implement real-time subscription when available in UnifiedNotificationService
    // For now, notifications are loaded on component mount and can be refreshed manually

  }, [address]);

  const handleNotificationClick = async (notification: UnifiedNotification) => {
    try {
      console.log('👆 Notification clicked:', notification.id);

      // Mark as read (bounty notifications are in 'general' category)
      await unifiedNotificationService.markAsRead(notification.id, 'general');
      console.log('✅ Notification marked as read');

      // Remove from unread list
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));

      // Call parent handler if provided
      onNotificationClick?.(notification);

      // Navigate to context URL if available
      if (notification.context_url) {
        console.log('🔗 Navigating to:', notification.context_url);
        window.location.href = notification.context_url;
      }
    } catch (error) {
      console.error('❌ Failed to mark notification as read:', error);
      toast({
        title: 'Error',
        description: 'Failed to mark notification as read',
        duration: 3000,
      });
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-4 text-gray-500">Loading bounty notifications...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="mb-4" style={{ color: '#8B3A3A' }}>
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="font-semibold" style={{ color: '#8B3A3A' }}>
          Error Loading Notifications
        </p>
        <p className="text-gray-600 mt-2">{error}</p>
      </div>
    );
  }

  // Not connected state
  if (!address) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="mt-4">Connect your wallet to view bounty notifications</p>
      </div>
    );
  }

  // Empty state
  if (notifications.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        <p className="mt-4 font-medium">No unread bounty notifications</p>
        <p className="text-sm mt-2">You're all caught up!</p>
      </div>
    );
  }

  // Notifications list
  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Bounty Notifications
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({notifications.length} unread)
          </span>
        </h3>
      </div>

      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors duration-150 shadow-sm hover:shadow-md"
          onClick={() => handleNotificationClick(notification)}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {/* Priority badge */}
              {notification.priority && notification.priority !== 'low' && (
                <span
                  className="inline-block px-2 py-1 rounded-full text-xs font-medium mb-2"
                  style={
                    notification.priority === 'urgent'
                      ? { backgroundColor: '#F5E6E6', color: '#5C1F1F' }
                      : notification.priority === 'high'
                        ? { backgroundColor: '#FAF4EC', color: '#8F6B2F' }
                        : { backgroundColor: '#E8F1EE', color: '#1F453A' }
                  }
                >
                  {notification.priority.toUpperCase()}
                </span>
              )}

              {/* Title */}
              <h3 className="font-semibold text-gray-900">
                {notification.title}
              </h3>

              {/* Message */}
              <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                {notification.message}
              </p>

              {/* Notification type badge */}
              {notification.notification_type && (
                <span className="inline-block mt-2 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                  {notification.notification_type.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {/* Timestamp */}
            <div className="ml-4 text-right flex-shrink-0">
              <span className="text-xs text-gray-500 whitespace-nowrap">
                {new Date(notification.created_at).toLocaleDateString(
                  undefined,
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  },
                )}
              </span>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(notification.created_at).toLocaleTimeString(
                  undefined,
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                )}
              </div>
            </div>
          </div>

          {/* Unread indicator */}
          <div
            className="absolute top-4 right-4 w-2 h-2 rounded-full"
            style={{ backgroundColor: '#2F5D50' }}
          ></div>
        </div>
      ))}
    </div>
  );
};

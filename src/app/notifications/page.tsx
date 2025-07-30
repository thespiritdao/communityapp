'use client';

import { useNotifications } from 'src/context/NotificationContext';
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { supabase } from 'src/utils/supabaseClient';

// Simple date formatting function to replace date-fns
function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`;
  }
  
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears > 1 ? 's' : ''} ago`;
}

export default function NotificationsPage() {
  const { notifications, loading, error, markAsRead, markAllAsRead, refreshNotifications } = useNotifications();
  const { address } = useAccount();
  const [showAllNotifications, setShowAllNotifications] = useState(false);

  // Force refresh notifications when page loads
  useEffect(() => {
    if (address) {
      console.log('Notifications page loaded, refreshing notifications for:', address);
      refreshNotifications();
    }
  }, [address, refreshNotifications]);

  // Filter notifications based on toggle
  const displayedNotifications = showAllNotifications 
    ? notifications 
    : notifications.filter(n => !n.is_read);

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Please connect your wallet to view notifications.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Error loading notifications: {error}</p>
        </div>
      </div>
    );
  }

  const unreadNotifications = displayedNotifications.filter(n => !n.is_read);
  const readNotifications = displayedNotifications.filter(n => n.is_read);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="showAll"
              checked={showAllNotifications}
              onChange={(e) => setShowAllNotifications(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="showAll" className="text-sm font-medium text-gray-700">
              Show all notifications
            </label>
          </div>
          {unreadNotifications.length > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {displayedNotifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🔔</div>
            <h2 className="text-xl font-semibold text-gray-600 mb-2">
              {showAllNotifications ? "No notifications yet" : "No unread notifications"}
            </h2>
            <p className="text-gray-500">
              {showAllNotifications 
                ? "You'll see notifications here when someone mentions you or interacts with your content."
                : "All caught up! Toggle 'Show all notifications' to see your notification history."
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Unread notifications */}
            {unreadNotifications.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 text-blue-600">
                  Unread ({unreadNotifications.length})
                </h2>
                <div className="space-y-3">
                  {unreadNotifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={() => markAsRead(notification.id)}
                      isUnread={true}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Read notifications */}
            {readNotifications.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 text-gray-600">
                  Read ({readNotifications.length})
                </h2>
                <div className="space-y-3">
                  {readNotifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={() => markAsRead(notification.id)}
                      isUnread={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface NotificationCardProps {
  notification: any;
  onMarkAsRead: () => void;
  isUnread: boolean;
}

function NotificationCard({ notification, onMarkAsRead, isUnread }: NotificationCardProps) {
  // State for sender profile picture
  const [senderProfilePicture, setSenderProfilePicture] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSenderProfilePicture() {
      if (notification.notification_type === 'user_mentioned' && notification.sender_address) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('profile_picture')
          .eq('wallet_address', notification.sender_address)
          .single();
        if (data && data.profile_picture) {
          setSenderProfilePicture(data.profile_picture);
        } else {
          setSenderProfilePicture('images/observableinfinities.png');
        }
      }
    }
    fetchSenderProfilePicture();
  }, [notification.notification_type, notification.sender_address]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'forum_reply':
        return '💬';
      case 'chat_message':
        return '💭';
      case 'bounty_update':
        return '💰';
      case 'purchase_completed':
        return '🛒';
      case 'user_mentioned':
        return '👤';
      default:
        return '🔔';
    }
  };

  const getContextLink = () => {
    if (notification.context_url) {
      return notification.context_url;
    }
    
    switch (notification.context_type) {
      case 'forum':
        return notification.context_id ? `/forum/thread/${notification.context_id}` : '/forum';
      case 'chat':
        return notification.context_id ? `/chat/${notification.context_id}` : '/chat';
      case 'bounty':
        return notification.context_id ? `/bounty/${notification.context_id}` : '/bounty';
      case 'marketplace':
        return notification.context_id ? `/market/orders/${notification.context_id}` : '/market';
      case 'governance':
        return notification.context_id ? `/vote/${notification.context_id}` : '/vote';
      default:
        return '#';
    }
  };

  return (
    <div className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${
      isUnread ? 'border-l-blue-500' : 'border-l-gray-300'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          {notification.notification_type === 'user_mentioned' ? (
            <img
              src={senderProfilePicture || '/observableinfinities.png'}
              alt="Profile"
              className="w-10 h-10 rounded-full object-cover border border-gray-200"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/observableinfinities.png';
              }}
            />
          ) : (
            <div className="text-2xl">{getNotificationIcon(notification.notification_type)}</div>
          )}
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h3 className="font-semibold text-gray-900">{notification.title}</h3>
              {isUnread && (
                <span className="inline-block w-2 h-2 bg-blue-500 rounded-full"></span>
              )}
            </div>
            <p className="text-gray-600 mb-2">{notification.message}</p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {formatDistanceToNow(new Date(notification.created_at))}
              </span>
              {notification.context_url && (
                <a
                  href={getContextLink()}
                  className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
                >
                  View →
                </a>
              )}
            </div>
          </div>
        </div>
        {isUnread && (
          <button
            onClick={onMarkAsRead}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-2"
            title="Mark as read"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
} 
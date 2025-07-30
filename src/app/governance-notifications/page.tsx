'use client';

import { useGovernanceNotifications } from 'src/context/GovernanceNotificationContext';
import { useAccount } from 'wagmi';
import { useEffect, useState } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import Link from 'next/link';
import { ExternalLink, Clock, User, FileText } from 'lucide-react';

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

export default function GovernanceNotificationsPage() {
  const { notifications, loading, error, markAsRead, markAllAsRead } = useGovernanceNotifications();
  const { address } = useAccount();

  if (!address) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Governance Notifications</h1>
          <p className="text-gray-600">Please connect your wallet to view governance notifications.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Governance Notifications</h1>
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
          <h1 className="text-2xl font-bold mb-4">Governance Notifications</h1>
          <p className="text-red-600">Error loading governance notifications: {error}</p>
        </div>
      </div>
    );
  }

  const unreadNotifications = notifications.filter(n => !n.is_read);
  const readNotifications = notifications.filter(n => n.is_read);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Governance Notifications</h1>
          {unreadNotifications.length > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Mark all as read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🗳️</div>
            <h2 className="text-xl font-semibold text-gray-600 mb-2">No governance notifications yet</h2>
            <p className="text-gray-500">You'll see governance notifications here when someone mentions you in a proposal or when proposals are created.</p>
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
                    <GovernanceNotificationCard
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
                    <GovernanceNotificationCard
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

interface GovernanceNotificationCardProps {
  notification: any;
  onMarkAsRead: () => void;
  isUnread: boolean;
}

function GovernanceNotificationCard({ notification, onMarkAsRead, isUnread }: GovernanceNotificationCardProps) {
  const [senderProfilePicture, setSenderProfilePicture] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSenderProfilePicture() {
      if (notification.sender_address) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('profile_picture')
          .eq('wallet_address', notification.sender_address)
          .single();
        if (data && data.profile_picture) {
          setSenderProfilePicture(data.profile_picture);
        } else {
          setSenderProfilePicture('/observableinfinities.png');
        }
      }
    }
    fetchSenderProfilePicture();
  }, [notification.sender_address]);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'proposal_mentioned':
        return '👥';
      case 'proposal_created':
        return '📝';
      case 'proposal_voted':
        return '🗳️';
      case 'proposal_executed':
        return '✅';
      case 'proposal_cancelled':
        return '❌';
      case 'token_holder_notification':
        return '🔑';
      default:
        return '🔔';
    }
  };

  const getContextLink = () => {
    if (notification.context_url) {
      return notification.context_url;
    }
    
    if (notification.proposal_id) {
      return `/vote/${notification.proposal_id}`;
    }
    
    return '#';
  };

  const getBasescanUrl = (transactionHash: string) => {
    return `https://basescan.org/tx/${transactionHash}`;
  };

  return (
    <div className={`bg-white rounded-lg p-4 shadow-sm border-l-4 ${
      isUnread ? 'border-l-blue-500' : 'border-l-gray-300'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <img
            src={senderProfilePicture || '/observableinfinities.png'}
            alt="Profile"
            className="w-10 h-10 rounded-full object-cover border border-gray-200"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = '/observableinfinities.png';
            }}
          />
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
              <div className="flex items-center space-x-2">
                {notification.context_url && (
                  <Link
                    href={getContextLink()}
                    className="text-sm text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    View Proposal →
                  </Link>
                )}
                {notification.transaction_hash && (
                  <a
                    href={getBasescanUrl(notification.transaction_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-500 hover:text-gray-600 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
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
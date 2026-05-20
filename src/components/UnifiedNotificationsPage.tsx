// src/components/UnifiedNotificationsPage.tsx

'use client';

import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Bell,
  Vote,
  Calendar,
  Clock,
  ExternalLink,
  CheckCircle,
  MessageCircle,
  ShoppingCart,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import type {
  UnifiedNotification,
  NotificationCategory,
} from '@/services/unifiedNotificationService';

// Date formatting function
function formatDistanceToNow(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${diffInWeeks}w ago`;

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}mo ago`;

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}

interface NotificationCardProps {
  notification: UnifiedNotification;
  onMarkAsRead: () => void;
}

function NotificationCard({
  notification,
  onMarkAsRead,
}: NotificationCardProps) {
  const hasHumanSender =
    !!notification.sender_address && notification.sender_address !== 'system';

  const getNotificationIcon = () => {
    switch (notification.notification_type) {
      case 'user_mentioned':
        return '👤';
      case 'proposal_mentioned':
      case 'proposal_created':
      case 'voting_reminder':
      case 'token_holder_notification':
        return <Vote className="w-8 h-8 text-[#2F5D50]" />;
      case 'forum_reply':
        return '💬';
      case 'chat_message':
        return '💭';
      case 'bounty_update':
        return '💰';
      case 'pod_pending_review':
      case 'pod_member_removed':
      case 'pod_leadership_invitation':
      case 'pod_member_joined':
      case 'pod_application_status':
        return '🏛️';
      case 'event_registration':
      case 'event_checkin':
        return <Calendar className="w-8 h-8 text-green-600" />;
      case 'purchase_completed':
        return '🛒';
      default:
        return <Bell className="w-8 h-8 text-gray-600" />;
    }
  };

  const getPriorityColor = () => {
    switch (notification.priority) {
      case 'urgent':
        return 'border-l-red-500 bg-red-50';
      case 'high':
        return 'border-l-orange-500 bg-orange-50';
      case 'medium':
        return 'border-l-[#2F5D50] bg-[#E8F1EE]';
      case 'low':
        return 'border-l-gray-500 bg-white';
      default:
        return 'border-l-[#2F5D50] bg-white';
    }
  };

  const getContextLink = () => {
    if (notification.context_url) {
      return notification.context_url;
    }

    switch (notification.context_type) {
      case 'forum':
        return notification.context_id
          ? `/forum/thread/${notification.context_id}`
          : '/forum';
      case 'chat':
        return notification.context_id
          ? `/chat?dm=${notification.context_id}`
          : '/chat';
      case 'bounty':
        return notification.context_id
          ? `/bounty/${notification.context_id}`
          : '/bounty';
      case 'governance':
        return notification.context_id
          ? `/governance/${notification.context_id}`
          : '/governance';
      case 'marketplace':
        return notification.context_id
          ? `/market/orders/${notification.context_id}`
          : '/market';
      case 'events':
        return notification.context_id
          ? `/events/${notification.context_id}`
          : '/events';
      case 'pod':
        return '/pods/review';
      default:
        return '#';
    }
  };

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-md ${
        notification.is_read ? 'border-l-gray-300 bg-white' : getPriorityColor()
      } border-l-4`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="flex-shrink-0 mt-1">{getNotificationIcon()}</div>
            <div className="flex-1 min-w-0 overflow-hidden">
              {/* Title row with priority indicators */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 truncate text-sm leading-tight">
                    {notification.title}
                  </h3>
                  {!notification.is_read && (
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <span className="inline-block w-2 h-2 bg-[#2F5D50] rounded-full"></span>
                    </div>
                  )}
                </div>
                {notification.priority &&
                  notification.priority !== 'medium' && (
                    <Badge
                      variant={
                        notification.priority === 'urgent'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs flex-shrink-0"
                    >
                      {notification.priority}
                    </Badge>
                  )}
              </div>

              {/* Sender namecard for human-sent notifications */}
              {hasHumanSender && (
                <div className="mb-2">
                  <UserProfileDisplay
                    walletAddress={notification.sender_address!}
                    size="sm"
                  />
                </div>
              )}

              {/* Message with line clamping */}
              <p className="text-gray-600 text-sm mb-3 text-truncate-2">
                {notification.message}
              </p>

              {/* Bottom row with metadata and action */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-xs text-gray-500 min-w-0 flex-1">
                  <span className="truncate">
                    {formatDistanceToNow(new Date(notification.created_at))}
                  </span>
                  <Badge
                    variant="outline"
                    className="text-xs flex-shrink-0 px-1"
                  >
                    {notification.category}
                  </Badge>
                </div>
                {notification.context_url && (
                  <a
                    href={getContextLink()}
                    className="flex items-center space-x-1 text-xs text-[#2F5D50] hover:text-[#2F5D50] transition-colors flex-shrink-0"
                  >
                    <span>View</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Mark as read button */}
          {!notification.is_read && (
            <div className="flex-shrink-0">
              <Button
                onClick={onMarkAsRead}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-gray-600 p-1 h-8 w-8"
                title="Mark as read"
              >
                <CheckCircle className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UnifiedNotificationsPage() {
  const { evmAddress: address } = useEvmAddress();
  const {
    notifications,
    unreadCounts,
    loading,
    error,
    selectedCategory,
    setSelectedCategory,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  } = useUnifiedNotifications();

  // No need to force refresh - context handles it

  if (!address) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Notifications</h1>
          <p className="text-gray-600">
            Please connect your wallet to view notifications.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">Notifications</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">Error loading notifications: {error}</p>
            <Button
              onClick={refreshNotifications}
              variant="outline"
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Client-side filtering based on category only (all notifications shown are unread)
  const filteredNotifications = notifications.filter((n) => {
    // Filter by category
    if (selectedCategory !== 'all' && n.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen p-4 bottom-nav-spacing" style={{ backgroundImage: 'url(/images/chatbg.png)', backgroundColor: '#f5f4ed' }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold">Notifications</h1>
            <div className="flex items-center space-x-2"></div>
          </div>
          <div className="flex items-center space-x-2">
            <Link href="/notifications/preferences">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center space-x-1"
                title="Notification Preferences"
              >
                <span>Settings</span>
              </Button>
            </Link>
            <Button
              onClick={refreshNotifications}
              variant="outline"
              size="sm"
              className="flex items-center space-x-1"
            >
              <span>Refresh</span>
            </Button>
            {unreadCounts.total > 0 && (
              <Button
                onClick={() =>
                  markAllAsRead(
                    selectedCategory === 'all' ? undefined : selectedCategory,
                  )
                }
                size="sm"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Category Tabs */}
        <Tabs
          value={selectedCategory}
          onValueChange={(value) =>
            setSelectedCategory(value as NotificationCategory | 'all')
          }
        >
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="all" className="flex items-center space-x-1">
              <Bell className="w-4 h-4" />
              <span className="text-xs">All ({unreadCounts.total})</span>
            </TabsTrigger>
            <TabsTrigger
              value="general"
              className="flex items-center space-x-1"
              title="Mentions"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="text-xs">({unreadCounts.general})</span>
            </TabsTrigger>
            <TabsTrigger
              value="governance"
              className="flex items-center space-x-1"
              title="Governance"
            >
              <Vote className="w-4 h-4" />
              <span className="text-xs">({unreadCounts.governance})</span>
            </TabsTrigger>
            <TabsTrigger
              value="marketplace"
              className="flex items-center space-x-1"
              title="Marketplace"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs">({unreadCounts.marketplace || 0})</span>
            </TabsTrigger>
            <TabsTrigger
              value="events"
              className="flex items-center space-x-1"
              title="Events"
            >
              <Calendar className="w-4 h-4" />
              <span className="text-xs">({unreadCounts.events})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="space-y-4">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 text-6xl mb-4">
                  {selectedCategory === 'governance'
                    ? '🗳️'
                    : selectedCategory === 'events'
                      ? '📅'
                      : selectedCategory === 'marketplace'
                        ? '🛒'
                        : '🔔'}
                </div>
                <h2 className="text-xl font-semibold text-gray-600 mb-2">
                  No notifications yet
                </h2>
                <p className="text-gray-500">
                  You'll see{' '}
                  {selectedCategory === 'all' ? '' : selectedCategory + ' '}
                  notifications here when there's activity.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    onMarkAsRead={() =>
                      markAsRead(notification.id, notification.category)
                    }
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

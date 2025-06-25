import React from 'react';
import { useToast } from 'src/components/ui/use-toast';
import { Toast } from 'src/components/ui/toast';

export interface BountyNotification {
  id: string;
  type: 'new_bounty' | 'bid_received' | 'bounty_completed';
  title: string;
  message: string;
  timestamp: Date;
}

interface BountyNotificationsProps {
  notifications: BountyNotification[];
  onNotificationClick?: (notification: BountyNotification) => void;
}

export const BountyNotifications: React.FC<BountyNotificationsProps> = ({
  notifications,
  onNotificationClick,
}) => {
  const { toast } = useToast();

  React.useEffect(() => {
    // Show toast for new notifications
    notifications.forEach((notification) => {
      toast({
        title: notification.title,
        description: notification.message,
        duration: 5000,
      });
    });
  }, [notifications, toast]);

  return (
    <div className="space-y-4">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="p-4 border rounded-lg cursor-pointer hover:bg-gray-50"
          onClick={() => onNotificationClick?.(notification)}
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">{notification.title}</h3>
              <p className="text-sm text-gray-600">{notification.message}</p>
            </div>
            <span className="text-xs text-gray-500">
              {notification.timestamp.toLocaleDateString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}; 
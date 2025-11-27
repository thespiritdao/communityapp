'use client';

import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { useAccount } from 'wagmi';

export default function TestNotificationsPage() {
  const { address } = useAccount();
  const { notifications, unreadCounts, loading, error } = useUnifiedNotifications();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Notification System Test</h1>
      
      <div className="space-y-4">
        <div className="p-4 bg-green-100 rounded">
          <h2 className="font-semibold">✅ Context Loaded Successfully</h2>
          <p>The UnifiedNotificationContext is working!</p>
        </div>
        
        <div className="p-4 bg-blue-100 rounded">
          <h2 className="font-semibold">Status:</h2>
          <ul className="list-disc list-inside">
            <li>Address: {address || 'Not connected'}</li>
            <li>Loading: {loading ? 'Yes' : 'No'}</li>
            <li>Error: {error || 'None'}</li>
            <li>Total Notifications: {notifications.length}</li>
            <li>Unread Count: {unreadCounts.total}</li>
          </ul>
        </div>
        
        <div className="p-4 bg-gray-100 rounded">
          <h2 className="font-semibold">Unread Breakdown:</h2>
          <ul className="list-disc list-inside">
            <li>General: {unreadCounts.general}</li>
            <li>Governance: {unreadCounts.governance}</li>
            <li>Events: {unreadCounts.events}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
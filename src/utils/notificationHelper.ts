/**
 * Utility functions for managing notification badges in the bottom nav
 * 
 * Usage anywhere in your app:
 * import { updateNotificationCount } from '@/utils/notificationHelper';
 * updateNotificationCount(5); // Shows badge with count 5
 * updateNotificationCount(0); // Hides badge
 */

export function updateNotificationCount(count: number): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent("notifications:count", { detail: count })
    );
  }
}

// Example: Update from your notification context or service
export function useNotificationBadge() {
  return {
    setCount: updateNotificationCount,
    clearBadge: () => updateNotificationCount(0),
  };
}
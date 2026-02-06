/**
 * Utility functions for managing notification badges in the bottom nav AND app icon
 *
 * Usage anywhere in your app:
 * import { updateNotificationCount } from '@/utils/notificationHelper';
 * updateNotificationCount(5); // Shows badge with count 5 (in-app + app icon)
 * updateNotificationCount(0); // Hides badge (in-app + app icon)
 */

/**
 * Update the app icon badge (mobile/desktop PWA)
 * Uses the Badge API for OS-level notifications
 */
export function updateAppIconBadge(count: number): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  // Check if Badge API is supported
  if ('setAppBadge' in navigator && 'clearAppBadge' in navigator) {
    try {
      if (count > 0) {
        // @ts-ignore - Badge API not yet in TypeScript types
        navigator.setAppBadge(count);
        console.log(`[Badge API] Set app icon badge to ${count}`);
      } else {
        // @ts-ignore - Badge API not yet in TypeScript types
        navigator.clearAppBadge();
        console.log('[Badge API] Cleared app icon badge');
      }
    } catch (error) {
      console.warn('[Badge API] Failed to update app badge:', error);
    }
  } else {
    console.log('[Badge API] Not supported in this browser');
  }
}

/**
 * Update both in-app notification badge AND app icon badge
 */
export function updateNotificationCount(count: number): void {
  if (typeof window !== 'undefined') {
    // Update in-app badge (bottom nav)
    window.dispatchEvent(
      new CustomEvent('notifications:count', { detail: count }),
    );

    // Update app icon badge (OS-level)
    updateAppIconBadge(count);
  }
}

// Example: Update from your notification context or service
export function useNotificationBadge() {
  return {
    setCount: updateNotificationCount,
    clearBadge: () => updateNotificationCount(0),
    setAppIconBadge: updateAppIconBadge,
  };
}

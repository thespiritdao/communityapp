// src/components/PWAManager.tsx
'use client';

import { useEffect } from 'react';

/**
 * PWA Manager - Handles service worker registration
 * Must be a client component to access browser APIs
 */
export function PWAManager() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PWA] Service workers not supported');
      return;
    }

    // Register service worker
    registerServiceWorker();

    // Listen for service worker updates
    listenForUpdates();
  }, []);

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('✅ [PWA] Service worker registered:', registration.scope);

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);

    } catch (error) {
      console.error('❌ [PWA] Service worker registration failed:', error);
    }
  }

  function listenForUpdates() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] New service worker activated');

      // Optionally show notification that app has been updated
      if (window.confirm('New version available! Reload to update?')) {
        window.location.reload();
      }
    });
  }

  // This component doesn't render anything
  return null;
}

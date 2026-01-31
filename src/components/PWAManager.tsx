// src/components/PWAManager.tsx
'use client';

import { useEffect, useState } from 'react';

/**
 * PWA Manager - Handles service worker registration and auto-updates
 * Must be a client component to access browser APIs
 */
export function PWAManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [countdown, setCountdown] = useState(3);

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

  // Auto-reload countdown
  useEffect(() => {
    if (updateAvailable && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (updateAvailable && countdown === 0) {
      console.log('[PWA] Auto-reloading to apply update...');
      window.location.reload();
    }
  }, [updateAvailable, countdown]);

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('✅ [PWA] Service worker registered:', registration.scope);

      // Check for updates every 15 minutes (more frequent for critical fixes)
      setInterval(() => {
        console.log('[PWA] Checking for updates...');
        registration.update();
      }, 15 * 60 * 1000);

      // Also check for updates when page becomes visible (tab switching)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          console.log('[PWA] Page visible, checking for updates...');
          registration.update();
        }
      });

    } catch (error) {
      console.error('❌ [PWA] Service worker registration failed:', error);
    }
  }

  function listenForUpdates() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[PWA] ✨ New service worker activated - update available!');

      // Trigger auto-reload with countdown
      setUpdateAvailable(true);
    });
  }

  // Show update notification with countdown
  if (updateAvailable) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '16px 24px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            ✨ Update Available
          </div>
          <div style={{ opacity: 0.9 }}>
            Reloading in {countdown} second{countdown !== 1 ? 's' : ''}...
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            border: 'none',
            color: 'white',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
          }}
        >
          Update Now
        </button>
      </div>
    );
  }

  // This component doesn't render anything when no update is available
  return null;
}

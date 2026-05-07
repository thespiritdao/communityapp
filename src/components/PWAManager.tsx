// src/components/PWAManager.tsx
'use client';

import { useEffect, useState } from 'react';

/**
 * PWA Manager - Handles service worker registration and auto-updates.
 * Must be a server-component-safe client component (no CDP hooks).
 * Push subscription is handled separately by PushSubscriptionManager
 * inside the CDP provider tree.
 */
export function PWAManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PWA] Service workers not supported');
      return;
    }

    registerServiceWorker();
    listenForUpdates();
  }, []);

  // Auto-reload countdown
  useEffect(() => {
    if (updateAvailable && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (updateAvailable && countdown === 0) {
      window.location.reload();
    }
  }, [updateAvailable, countdown]);

  async function registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/api/sw', { scope: '/' });
      console.log('✅ [PWA] Service worker registered:', registration.scope);

      setInterval(() => registration.update(), 15 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) registration.update();
      });
    } catch (error) {
      console.error('❌ [PWA] Service worker registration failed:', error);
    }
  }

  function listenForUpdates() {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      setUpdateAvailable(true);
    });
  }

  if (updateAvailable) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#3F7A5A',
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
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>✨ Update Available</div>
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

  return null;
}

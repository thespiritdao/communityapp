// src/components/PWAManager.tsx
'use client';

import { useEffect, useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * PWA Manager - Handles service worker registration, auto-updates,
 * and Web Push subscription registration.
 */
export function PWAManager() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const { evmAddress: address } = useEvmAddress();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PWA] Service workers not supported');
      return;
    }

    registerServiceWorker();
    listenForUpdates();
  }, []);

  // Once address is available, attempt push subscription
  useEffect(() => {
    if (!address) return;
    subscribeToPush(address);
  }, [address]);

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
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
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

  async function subscribeToPush(userAddress: string) {
    try {
      if (!('PushManager' in window) || !VAPID_PUBLIC_KEY) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      // Already subscribed — re-save in case it changed
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, user_address: userAddress }),
      });

      console.log('✅ [PWA] Push subscription registered');
    } catch (error) {
      // Non-fatal — app works fine without push
      console.warn('[PWA] Push subscription failed:', error);
    }
  }

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

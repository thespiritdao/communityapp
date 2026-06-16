'use client';

import { useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { getCurrentSession } from '@/features/identity/utils/serverAuth';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * Requests push notification permission and registers the browser's
 * PushSubscription with the server once the user's wallet address is known.
 * Must be rendered inside CDPEmbeddedProvider.
 */
export function PushSubscriptionManager() {
  const { evmAddress: address } = useEvmAddress();

  useEffect(() => {
    if (!address) return;
    if (typeof window === 'undefined' || !('PushManager' in window) || !VAPID_PUBLIC_KEY) return;

    subscribeToPush(address);
  }, [address]);

  return null;
}

async function subscribeToPush(userAddress: string) {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();

    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    const session = await getCurrentSession();
    const authToken = session?.access_token;
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ subscription, user_address: userAddress }),
    });

    console.log('✅ [Push] Subscription registered');
  } catch (error) {
    console.warn('[Push] Subscription failed:', error);
  }
}

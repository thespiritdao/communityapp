'use client';

import { useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';

const HEARTBEAT_MS = 60_000; // 1 minute

/**
 * Silently upserts the connected wallet's presence every 60 seconds.
 * Renders nothing — drop it anywhere in the provider tree.
 */
export function PresenceTracker() {
  const { evmAddress: address } = useEvmAddress();

  useEffect(() => {
    if (!address) return;

    const upsert = () =>
      supabase
        .from('user_presence')
        .upsert({ wallet_address: address.toLowerCase(), last_seen_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.warn('[PresenceTracker] upsert error:', error.message);
        });

    upsert(); // immediate on mount / address change

    const timer = setInterval(upsert, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [address]);

  return null;
}

'use client';

import { useEffect } from 'react';
import { useUserWallet } from '@/hooks/useUserWallet';
import { supabase } from '@/utils/supabaseClient';

const HEARTBEAT_MS = 60_000; // 1 minute

/**
 * Silently upserts the connected user's presence every 60 seconds.
 * Renders nothing — drop it anywhere in the provider tree.
 *
 * Keys presence on the canonical user wallet (identity), not the
 * per-device CDP signing wallet — otherwise a non-canonical device
 * would record presence under an orphan address.
 */
export function PresenceTracker() {
  const address = useUserWallet();

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

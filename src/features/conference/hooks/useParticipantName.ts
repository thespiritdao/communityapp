// src/features/conference/hooks/useParticipantName.ts
//
// Resolves a display name for a conference participant by looking up
// their wallet address in user_profiles. Falls back to a truncated
// wallet address if no profile is found.

import { useState, useEffect } from 'react';
import { supabase } from '@/utils/supabaseClient';

const cache = new Map<string, string>();

export function useParticipantName(walletAddress: string | null | undefined): string {
  const normalized = walletAddress?.toLowerCase() ?? '';
  const [name, setName] = useState<string>(() => {
    if (!normalized) return '';
    if (cache.has(normalized)) return cache.get(normalized)!;
    return truncate(normalized);
  });

  useEffect(() => {
    if (!normalized) return;
    if (cache.has(normalized)) {
      setName(cache.get(normalized)!);
      return;
    }

    supabase
      .from('user_profiles')
      .select('first_name, last_name, username')
      .eq('wallet_address', normalized)
      .maybeSingle()
      .then(({ data }) => {
        const fullName = [data?.first_name, data?.last_name].filter(Boolean).join(' ').trim();
        const resolved = fullName || data?.username || truncate(normalized);
        cache.set(normalized, resolved);
        setName(resolved);
      });
  }, [normalized]);

  return name;
}

function truncate(wallet: string): string {
  if (wallet.length < 10) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

// src/features/conference/hooks/useParticipantName.ts
//
// Resolves a display name for a conference participant by calling the
// /api/conference/participant-name endpoint (uses admin client, bypasses RLS).
// Results are cached in module scope — one fetch per wallet per page load.

import { useState, useEffect } from 'react';

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

export function useParticipantName(walletAddress: string | null | undefined): string {
  const normalized = walletAddress?.toLowerCase() ?? '';

  const [name, setName] = useState<string>(() => {
    if (!normalized) return '';
    return cache.get(normalized) ?? truncate(normalized);
  });

  useEffect(() => {
    if (!normalized) return;

    // Already resolved
    if (cache.has(normalized)) {
      setName(cache.get(normalized)!);
      return;
    }

    // Deduplicate concurrent requests for the same wallet
    let promise = inFlight.get(normalized);
    if (!promise) {
      promise = fetch(`/api/conference/participant-name?wallet=${encodeURIComponent(normalized)}`)
        .then(r => r.json())
        .then(({ name }) => {
          const resolved = name || truncate(normalized);
          console.log(`👤 useParticipantName: ${normalized.slice(0, 8)} → "${resolved}"`);
          cache.set(normalized, resolved);
          inFlight.delete(normalized);
          return resolved;
        })
        .catch(err => {
          console.error('useParticipantName error:', err);
          inFlight.delete(normalized);
          return truncate(normalized);
        });
      inFlight.set(normalized, promise);
    }

    promise.then(resolved => setName(resolved));
  }, [normalized]);

  return name;
}

function truncate(wallet: string): string {
  if (!wallet || wallet.length < 10) return wallet;
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

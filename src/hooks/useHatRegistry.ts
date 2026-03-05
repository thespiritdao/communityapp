'use client';

/**
 * useHatRegistry
 *
 * Client-side hook for accessing hat IDs from the database.
 * Fetches from /api/hat-registry and caches the result in module scope
 * so subsequent renders don't re-fetch.
 *
 * Usage:
 *   const { hatIds, loading } = useHatRegistry();
 *   const leaderHatId = hatIds?.EXECUTIVE_POD_LEADER;
 */

import { useState, useEffect } from 'react';
import type { HatIds } from '@/lib/hatRegistry';

// Module-level cache shared across all hook instances
let cachedIds: HatIds | null = null;
let fetchPromise: Promise<HatIds> | null = null;

async function fetchHatIds(): Promise<HatIds> {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetch('/api/hat-registry')
    .then((r) => r.json())
    .then((data) => {
      cachedIds = data as HatIds;
      return cachedIds;
    })
    .catch((err) => {
      fetchPromise = null; // Allow retry on next mount
      console.error('[useHatRegistry] Failed to load hat IDs:', err);
      return {} as HatIds;
    });
  return fetchPromise;
}

export interface UseHatRegistryResult {
  hatIds: HatIds | null;
  loading: boolean;
}

export function useHatRegistry(): UseHatRegistryResult {
  const [hatIds, setHatIds] = useState<HatIds | null>(cachedIds);
  const [loading, setLoading] = useState<boolean>(cachedIds === null);

  useEffect(() => {
    if (cachedIds) {
      setHatIds(cachedIds);
      setLoading(false);
      return;
    }
    fetchHatIds().then((ids) => {
      setHatIds(ids);
      setLoading(false);
    });
  }, []);

  return { hatIds, loading };
}

/**
 * Returns a single hat ID from the cached registry.
 * Returns undefined if registry hasn't loaded yet.
 */
export function useHatId(key: keyof HatIds): `0x${string}` | undefined {
  const { hatIds } = useHatRegistry();
  return hatIds?.[key];
}

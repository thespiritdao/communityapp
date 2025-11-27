import { useMemo } from 'react';
import { useProfilesContext } from '../context/ProfilesProvider';
import type { UserProfile } from '../types';

export interface UseProfilesOptions {
  staleTime?: number;
}

export interface UseProfilesResult {
  data: Record<string, UserProfile | undefined>;
  isLoading: boolean;
  error: Error | null;

  // Helper functions
  getProfile: (walletAddress: string) => UserProfile | undefined;
  hasProfile: (walletAddress: string) => boolean;
  isProfileLoading: (walletAddress: string) => boolean;
}

/**
 * useProfiles - Hook for batch profile fetching with caching
 *
 * Fetches multiple profiles efficiently with automatic deduplication,
 * caching, and parallel loading. Returns a lookup map for easy access.
 *
 * @param wallets Array of wallet addresses to fetch profiles for
 * @param options Optional configuration
 * @returns Profiles data with helper functions
 *
 * @example
 * ```tsx
 * const wallets = ['0x123...', '0x456...'];
 * const { data: profileMap, isLoading, getProfile } = useProfiles(wallets);
 *
 * // Use in render
 * return wallets.map(wallet => {
 *   const profile = getProfile(wallet);
 *   return <div>{profile?.first_name || wallet}</div>;
 * });
 * ```
 */
export function useProfiles(
  wallets: string[],
  options?: UseProfilesOptions,
): UseProfilesResult {
  const { getProfiles } = useProfilesContext();

  // Memoize the wallet list to prevent unnecessary re-queries
  const memoizedWallets = useMemo(() => {
    // Filter out invalid addresses and deduplicate
    const validWallets = wallets.filter(
      (wallet) =>
        wallet &&
        typeof wallet === 'string' &&
        wallet.length === 42 &&
        wallet.startsWith('0x'),
    );

    // Deduplicate and normalize
    return Array.from(new Set(validWallets.map((w) => w.toLowerCase())));
  }, [wallets]);

  // Fetch profiles using the context
  const { data, isLoading, error } = getProfiles(memoizedWallets);

  // Helper functions
  const getProfile = useMemo(
    () =>
      (walletAddress: string): UserProfile | undefined => {
        const normalizedAddress = walletAddress.toLowerCase();
        return data[normalizedAddress];
      },
    [data],
  );

  const hasProfile = useMemo(
    () =>
      (walletAddress: string): boolean => {
        const normalizedAddress = walletAddress.toLowerCase();
        return data[normalizedAddress] !== undefined;
      },
    [data],
  );

  const isProfileLoading = useMemo(
    () =>
      (walletAddress: string): boolean => {
        const normalizedAddress = walletAddress.toLowerCase();
        // If we don't have data for this address and we're loading, it's loading
        return data[normalizedAddress] === undefined && isLoading;
      },
    [data, isLoading],
  );

  return {
    data,
    isLoading,
    error,
    getProfile,
    hasProfile,
    isProfileLoading,
  };
}

/**
 * useProfile - Hook for single profile fetching
 *
 * Convenience hook for fetching a single profile with caching.
 *
 * @param walletAddress Single wallet address
 * @param options Optional configuration
 */
export function useProfile(
  walletAddress: string,
  options?: UseProfilesOptions,
) {
  const { getProfile } = useProfilesContext();

  const query = getProfile(walletAddress);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    isError: query.isError,
    isSuccess: query.isSuccess,
  };
}

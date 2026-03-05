import { useState, useEffect, useCallback, useMemo } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useTokenBalances } from '@/context/TokenBalancesContext';
import { getUserIdentity, type UserIdentity } from '@/utils/accessControlUtils';
import { canUserAccessProductAsync } from '../services/accessControl';
import type { IProduct } from '../models';
import { getClientHatId } from '@/lib/hatRegistryClient';

interface MarketplaceIdentity {
  identity: UserIdentity | null;
  isLoading: boolean;
  error: Error | null;
  canAccessProduct: (product: IProduct) => Promise<boolean>;
  canAccessProductSync: (product: IProduct) => boolean;
  refreshIdentity: () => Promise<void>;
}

// Session storage key for caching
const IDENTITY_CACHE_KEY = 'marketplace_user_identity';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedIdentity {
  identity: UserIdentity;
  timestamp: number;
  address: string;
}

/**
 * Unified hook for marketplace user identity and access control
 * - Single source of truth for user permissions
 * - Session-based caching to reduce redundant fetches
 * - Memoized access check functions
 */
export function useMarketplaceIdentity(): MarketplaceIdentity {
  const { evmAddress: address } = useEvmAddress();
  const { balances: tokenBalances, isLoading: tokenLoading } =
    useTokenBalances();

  const [identity, setIdentity] = useState<UserIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Check for cached identity on mount
  const getCachedIdentity = useCallback((): UserIdentity | null => {
    if (!address) return null;

    try {
      const cached = sessionStorage.getItem(IDENTITY_CACHE_KEY);
      if (!cached) return null;

      const parsed: CachedIdentity = JSON.parse(cached);

      // Validate cache
      if (parsed.address !== address) {
        sessionStorage.removeItem(IDENTITY_CACHE_KEY);
        return null;
      }

      // Check if cache is still fresh
      if (Date.now() - parsed.timestamp > CACHE_DURATION) {
        sessionStorage.removeItem(IDENTITY_CACHE_KEY);
        return null;
      }

      console.log(
        '🎯 Using cached marketplace identity (age:',
        Math.round((Date.now() - parsed.timestamp) / 1000),
        'seconds)',
      );
      return parsed.identity;
    } catch (err) {
      console.error('Error reading identity cache:', err);
      return null;
    }
  }, [address]);

  // Cache the identity
  const setCachedIdentity = useCallback(
    (identity: UserIdentity) => {
      if (!address) return;

      try {
        const cacheData: CachedIdentity = {
          identity,
          timestamp: Date.now(),
          address,
        };
        sessionStorage.setItem(IDENTITY_CACHE_KEY, JSON.stringify(cacheData));
        console.log('💾 Cached marketplace identity for', address);
      } catch (err) {
        console.error('Error caching identity:', err);
      }
    },
    [address],
  );

  // Load user identity
  const loadIdentity = useCallback(
    async (forceRefresh = false) => {
      if (!address || !tokenBalances || tokenLoading) {
        setIdentity(null);
        setIsLoading(false);
        return;
      }

      // Check cache first unless forcing refresh
      if (!forceRefresh) {
        const cached = getCachedIdentity();
        if (cached) {
          setIdentity(cached);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log('🔍 Loading fresh marketplace identity for', address);
        const userIdentity = await getUserIdentity(address, tokenBalances);

        setIdentity(userIdentity);
        setCachedIdentity(userIdentity);

        console.log('✅ Marketplace identity loaded:', {
          address,
          tokenCount: userIdentity.userTokens.length,
          hatCount: userIdentity.userHats.length,
          cached: !forceRefresh,
        });
      } catch (err) {
        console.error('❌ Error loading marketplace identity:', err);
        setError(err as Error);
        setIdentity(null);
      } finally {
        setIsLoading(false);
      }
    },
    [
      address,
      tokenBalances,
      tokenLoading,
      getCachedIdentity,
      setCachedIdentity,
    ],
  );

  // Initial load and updates
  useEffect(() => {
    loadIdentity();
  }, [address, tokenBalances, tokenLoading]);

  // Memoized access check functions
  const canAccessProduct = useCallback(
    async (product: IProduct): Promise<boolean> => {
      if (!identity) return false;

      try {
        return await canUserAccessProductAsync(product, identity);
      } catch (err) {
        console.error('Error checking product access:', err);
        return false;
      }
    },
    [identity],
  );

  const canAccessProductSync = useCallback(
    (product: IProduct): boolean => {
      if (!identity) return false;

      // For sync checks, we can't resolve pod roles
      // This is a limitation that should be documented
      const requiredToken = product.required_token || product.requiredToken;
      if (requiredToken?.startsWith('pod_')) {
        console.warn(
          'Sync access check cannot resolve pod roles, use async version',
        );
        return false;
      }

      // Use the sync version from accessControl service
      const { canUserAccessProduct } = require('../services/accessControl');
      return canUserAccessProduct(product, identity);
    },
    [identity],
  );

  // Refresh function for manual updates
  const refreshIdentity = useCallback(async () => {
    console.log('🔄 Manually refreshing marketplace identity');
    await loadIdentity(true);
  }, [loadIdentity]);

  // Clear cache on address change
  useEffect(() => {
    return () => {
      if (!address) {
        sessionStorage.removeItem(IDENTITY_CACHE_KEY);
      }
    };
  }, [address]);

  return {
    identity,
    isLoading,
    error,
    canAccessProduct,
    canAccessProductSync,
    refreshIdentity,
  };
}

/**
 * Hook to check if current user can manage marketplace products
 */
export function useMarketplaceManager(): {
  canManageProducts: boolean;
  isLoading: boolean;
} {
  const { identity, isLoading } = useMarketplaceIdentity();

  const canManageProducts = useMemo(() => {
    if (!identity) return false;

    // Check for Executive Pod leader membership
    const execHat = getClientHatId('EXECUTIVE_POD_LEADER')?.toLowerCase();

    return identity.userHats.includes(execHat || '');
  }, [identity]);

  return {
    canManageProducts,
    isLoading,
  };
}

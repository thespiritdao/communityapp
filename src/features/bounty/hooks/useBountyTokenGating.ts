import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { fetchTokenBalances, type BountyTokenBalances } from '@/utils/fetchTokenBalances';
import type { BountyTokenGating } from '../types/bounty';
import { supabase } from '@/lib/supabase';

interface TokenGateCheck {
  bountyId: string;
  hasAccess: boolean;
  checkedAt: number;
  requiredTokens?: string[];
}

interface UseBountyTokenGatingReturn {
  checkBountyAccess: (bountyId: string, tokenGating?: BountyTokenGating) => Promise<boolean>;
  checkMultipleBountyAccess: (bounties: Array<{id: string; token_gating?: BountyTokenGating}>) => Promise<Map<string, boolean>>;
  isChecking: boolean;
  clearCache: () => void;
  getCachedAccess: (bountyId: string) => boolean | undefined;
  prefetchTokenBalances: () => Promise<void>;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BATCH_SIZE = 10; // Process bounties in batches

/**
 * Hook for managing bounty token gating and access control
 */
export const useBountyTokenGating = (): UseBountyTokenGatingReturn => {
  const { address } = useAccount();
  const [accessCache, setAccessCache] = useState<Map<string, TokenGateCheck>>(new Map());
  const [tokenBalances, setTokenBalances] = useState<BountyTokenBalances | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [balancesLoaded, setBalancesLoaded] = useState(false);

  // Token ID to balance property mapping
  const TOKEN_BALANCE_MAP: Record<string, keyof BountyTokenBalances> = {
    'EXEC': 'hasExecutivePod',
    'DEV': 'hasDevPod',
    'MARKET': 'hasMarketManagement',
    'BOUNTY': 'hasBountyHat',
    'EVENT': 'hasEventManagement',
    'ADVOCATE': 'hasAdvocate'  // Universal verified member access
  };

  /**
   * Prefetch token balances for the current user
   */
  const prefetchTokenBalances = useCallback(async () => {
    if (!address || balancesLoaded) return;

    try {
      const balances = await fetchTokenBalances(address);
      setTokenBalances({
        hasExecutivePod: balances.hasExecutivePod,
        hasDevPod: balances.hasDevPod,
        hasMarketManagement: balances.hasMarketManagement,
        hasBountyHat: balances.hasBountyHat,
        hasEventManagement: balances.hasEventManagement,
        hasAdvocate: balances.hasAdvocate
      } as BountyTokenBalances);
      setBalancesLoaded(true);
    } catch (error) {
      console.error('Error prefetching token balances:', error);
    }
  }, [address, balancesLoaded]);

  // Prefetch balances when address changes
  useEffect(() => {
    if (address && !balancesLoaded) {
      prefetchTokenBalances();
    }
  }, [address, prefetchTokenBalances, balancesLoaded]);

  // Reset when address changes
  useEffect(() => {
    setAccessCache(new Map());
    setTokenBalances(null);
    setBalancesLoaded(false);
  }, [address]);

  /**
   * Check if cached access is still valid
   */
  const isCacheValid = useCallback((check: TokenGateCheck): boolean => {
    return Date.now() - check.checkedAt < CACHE_TTL;
  }, []);

  /**
   * Get cached access for a bounty
   */
  const getCachedAccess = useCallback((bountyId: string): boolean | undefined => {
    const cached = accessCache.get(bountyId);
    if (cached && isCacheValid(cached)) {
      return cached.hasAccess;
    }
    return undefined;
  }, [accessCache, isCacheValid]);

  /**
   * Check access for a single bounty
   */
  const checkBountyAccess = useCallback(async (
    bountyId: string,
    tokenGating?: BountyTokenGating
  ): Promise<boolean> => {
    // Check cache first
    const cached = getCachedAccess(bountyId);
    if (cached !== undefined) {
      return cached;
    }

    // No gating = public access
    if (!tokenGating || tokenGating.restriction_level === 'public' || !tokenGating.required_tokens?.length) {
      const check: TokenGateCheck = {
        bountyId,
        hasAccess: true,
        checkedAt: Date.now()
      };
      setAccessCache(prev => new Map(prev).set(bountyId, check));
      return true;
    }

    // No wallet connected = no access to gated bounties
    if (!address) {
      const check: TokenGateCheck = {
        bountyId,
        hasAccess: false,
        checkedAt: Date.now(),
        requiredTokens: tokenGating.required_tokens?.map(t => t.token_name)
      };
      setAccessCache(prev => new Map(prev).set(bountyId, check));
      return false;
    }

    setIsChecking(true);

    try {
      // Get fresh token balances if not loaded
      let balances = tokenBalances;
      if (!balances) {
        const freshBalances = await fetchTokenBalances(address);
        balances = {
          hasExecutivePod: freshBalances.hasExecutivePod,
          hasDevPod: freshBalances.hasDevPod,
          hasMarketManagement: freshBalances.hasMarketManagement,
          hasBountyHat: freshBalances.hasBountyHat,
          hasEventManagement: freshBalances.hasEventManagement,
          hasAdvocate: freshBalances.hasAdvocate
        } as BountyTokenBalances;
        setTokenBalances(balances);
      }

      // Check if user has any required tokens
      const hasAccess = tokenGating.required_tokens.some(requiredToken => {
        const balanceKey = TOKEN_BALANCE_MAP[requiredToken.token_id];
        if (!balanceKey) return false;

        const hasToken = balances![balanceKey as keyof BountyTokenBalances];
        
        // If minimum balance is specified, we'd need to check actual balance
        // For now, we just check if they have the token (boolean check)
        return hasToken === true;
      });

      // Cache the result
      const check: TokenGateCheck = {
        bountyId,
        hasAccess,
        checkedAt: Date.now(),
        requiredTokens: tokenGating.required_tokens?.map(t => t.token_name)
      };
      setAccessCache(prev => new Map(prev).set(bountyId, check));

      return hasAccess;
    } catch (error) {
      console.error('Error checking bounty access:', error);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [address, tokenBalances, getCachedAccess]);

  /**
   * Check access for multiple bounties efficiently
   */
  const checkMultipleBountyAccess = useCallback(async (
    bounties: Array<{id: string; token_gating?: BountyTokenGating}>
  ): Promise<Map<string, boolean>> => {
    const results = new Map<string, boolean>();
    const toCheck: Array<{id: string; token_gating?: BountyTokenGating}> = [];

    // First pass: use cache where possible
    for (const bounty of bounties) {
      const cached = getCachedAccess(bounty.id);
      if (cached !== undefined) {
        results.set(bounty.id, cached);
      } else {
        toCheck.push(bounty);
      }
    }

    // If all results are cached, return immediately
    if (toCheck.length === 0) {
      return results;
    }

    setIsChecking(true);

    try {
      // Get token balances once for all checks
      let balances = tokenBalances;
      if (!balances && address) {
        const freshBalances = await fetchTokenBalances(address);
        balances = {
          hasExecutivePod: freshBalances.hasExecutivePod,
          hasDevPod: freshBalances.hasDevPod,
          hasMarketManagement: freshBalances.hasMarketManagement,
          hasBountyHat: freshBalances.hasBountyHat,
          hasEventManagement: freshBalances.hasEventManagement,
          hasAdvocate: freshBalances.hasAdvocate
        } as BountyTokenBalances;
        setTokenBalances(balances);
      }

      // Process in batches to avoid blocking
      for (let i = 0; i < toCheck.length; i += BATCH_SIZE) {
        const batch = toCheck.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (bounty) => {
          // Check each bounty's access
          const hasAccess = await checkBountyAccessInternal(
            bounty.id,
            bounty.token_gating,
            balances
          );
          results.set(bounty.id, hasAccess);
        }));

        // Small delay between batches to prevent blocking
        if (i + BATCH_SIZE < toCheck.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      return results;
    } catch (error) {
      console.error('Error checking multiple bounty access:', error);
      // Return partial results or all false on error
      for (const bounty of toCheck) {
        if (!results.has(bounty.id)) {
          results.set(bounty.id, false);
        }
      }
      return results;
    } finally {
      setIsChecking(false);
    }
  }, [address, tokenBalances, getCachedAccess]);

  /**
   * Internal function to check access without setting loading state
   */
  const checkBountyAccessInternal = async (
    bountyId: string,
    tokenGating: BountyTokenGating | undefined,
    balances: BountyTokenBalances | null
  ): Promise<boolean> => {
    // No gating = public access
    if (!tokenGating || tokenGating.restriction_level === 'public' || !tokenGating.required_tokens?.length) {
      const check: TokenGateCheck = {
        bountyId,
        hasAccess: true,
        checkedAt: Date.now()
      };
      setAccessCache(prev => new Map(prev).set(bountyId, check));
      return true;
    }

    // No wallet or balances = no access
    if (!address || !balances) {
      const check: TokenGateCheck = {
        bountyId,
        hasAccess: false,
        checkedAt: Date.now(),
        requiredTokens: tokenGating.required_tokens?.map(t => t.token_name)
      };
      setAccessCache(prev => new Map(prev).set(bountyId, check));
      return false;
    }

    // Check token requirements
    const hasAccess = tokenGating.required_tokens.some(requiredToken => {
      const balanceKey = TOKEN_BALANCE_MAP[requiredToken.token_id];
      if (!balanceKey) return false;
      return balances[balanceKey as keyof BountyTokenBalances] === true;
    });

    // Cache result
    const check: TokenGateCheck = {
      bountyId,
      hasAccess,
      checkedAt: Date.now(),
      requiredTokens: tokenGating.required_tokens?.map(t => t.token_name)
    };
    setAccessCache(prev => new Map(prev).set(bountyId, check));

    return hasAccess;
  };

  /**
   * Clear the access cache
   */
  const clearCache = useCallback(() => {
    setAccessCache(new Map());
    setBalancesLoaded(false);
  }, []);

  return {
    checkBountyAccess,
    checkMultipleBountyAccess,
    isChecking,
    clearCache,
    getCachedAccess,
    prefetchTokenBalances
  };
};

/**
 * Hook to get bounties with token gating from Supabase
 */
export const useBountiesWithTokenGating = () => {
  const { address } = useAccount();
  const [bounties, setBounties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { checkMultipleBountyAccess } = useBountyTokenGating();

  useEffect(() => {
    const fetchBounties = async () => {
      try {
        setLoading(true);

        // Fetch bounties with token gates
        const { data: bountiesData, error } = await supabase
          .from('bounties')
          .select(`
            *,
            bounty_token_gates (
              hat_id,
              hat_name,
              min_balance
            )
          `)
          .neq('status', 'draft')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform data to include token gating
        const bountiesWithGating = bountiesData?.map(bounty => ({
          ...bounty,
          token_gating: bounty.bounty_token_gates?.length > 0 ? {
            required_tokens: bounty.bounty_token_gates.map((gate: any) => ({
              token_id: gate.hat_id,
              token_name: gate.hat_name,
              token_type: 'hat',
              minimum_balance: gate.min_balance
            })),
            restriction_level: 'token_holders'
          } : {
            restriction_level: bounty.restriction_level || 'public'
          }
        })) || [];

        // Check access for all bounties if user is connected
        if (address) {
          const accessMap = await checkMultipleBountyAccess(bountiesWithGating);
          
          // Add access info to bounties
          const bountiesWithAccess = bountiesWithGating.map(bounty => ({
            ...bounty,
            userHasAccess: accessMap.get(bounty.id) ?? true
          }));

          setBounties(bountiesWithAccess);
        } else {
          // If no user, mark token-gated bounties as inaccessible
          const bountiesWithAccess = bountiesWithGating.map(bounty => ({
            ...bounty,
            userHasAccess: bounty.token_gating?.restriction_level === 'public'
          }));

          setBounties(bountiesWithAccess);
        }
      } catch (error) {
        console.error('Error fetching bounties with token gating:', error);
        setBounties([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBounties();
  }, [address, checkMultipleBountyAccess]);

  return { bounties, loading };
};
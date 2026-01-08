// src/hooks/useUserAuthorizedTokens.ts
'use client';

import { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { fetchUserAuthorizedTokensForGating } from '@/utils/marketplaceAccessService';

export interface AuthorizedToken {
  id: string;
  name: string;
  address: string;
  symbol: string;
  image_url?: string;
  pod_id?: string;
  role_name?: string;
}

/**
 * Hook to get tokens that the current user is authorized to use for product gating
 * Only returns tokens for pods where the user has marketplace access
 */
export const useUserAuthorizedTokens = () => {
  const { evmAddress: address } = useEvmAddress();
  const publicClient = usePublicClient();
  const [tokens, setTokens] = useState<AuthorizedToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAuthorizedTokens = async () => {
      if (!address || !publicClient) {
        setTokens([]);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`🎫 Fetching authorized tokens for user: ${address}`);
        const authorizedTokens = await fetchUserAuthorizedTokensForGating(
          address,
          publicClient,
        );

        console.log(`🎫 User can gate with ${authorizedTokens.length} tokens`);
        setTokens(authorizedTokens);
      } catch (err) {
        console.error('Error loading authorized tokens:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load authorized tokens',
        );
        setTokens([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthorizedTokens();
  }, [address, publicClient]);

  return {
    tokens,
    isLoading,
    error,
    hasTokens: tokens.length > 0,
    refresh: async () => {
      if (address && publicClient) {
        setIsLoading(true);
        try {
          const authorizedTokens = await fetchUserAuthorizedTokensForGating(
            address,
            publicClient,
          );
          setTokens(authorizedTokens);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to refresh tokens',
          );
        } finally {
          setIsLoading(false);
        }
      }
    },
  };
};

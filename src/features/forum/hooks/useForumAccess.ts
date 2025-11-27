// src/features/forum/hooks/useForumAccess.ts
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useTokenBalances } from '@/context/TokenBalancesContext';

interface ForumAccessResult {
  hasAccess: boolean;
  isLoading: boolean;
  error: string | null;
  accessType?: 'hat' | 'token' | 'role' | 'none';
  details: {
    userHats?: string[];
    userRoles?: any[];
    hasProofOfCuriosity?: boolean;
    checkedRequirement?: string;
  };
}

interface ForumAccessOptions {
  requiredToken?: string; // HAT ID, token address, or role requirement
  categoryId?: string; // For category-specific access
  allowPublic?: boolean; // Allow public access if no requirement specified
}

export function useForumAccess(
  options: ForumAccessOptions = {},
): ForumAccessResult {
  const { address, isConnected } = useAccount();
  const { userHats, userRoles } = useHatPermissions();
  const { balances } = useTokenBalances();

  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessType, setAccessType] = useState<
    'hat' | 'token' | 'role' | 'none'
  >('none');

  const { requiredToken, categoryId, allowPublic = false } = options;

  // Normalize PoC token address
  const POC = useMemo(
    () => (process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY || '').toLowerCase(),
    [],
  );

  const checkForumAccess = async () => {
    setIsLoading(true);
    setError(null);

    // Not connected - deny access unless public allowed
    if (!isConnected || !address) {
      setHasAccess(allowPublic);
      setAccessType('none');
      setIsLoading(false);
      return;
    }

    // Wait for permissions to load
    if (!userHats || !userRoles || !balances) {
      return; // Keep loading until all data is available
    }

    try {
      // No specific token required - grant access if generally allowed
      if (!requiredToken) {
        if (allowPublic) {
          setHasAccess(true);
          setAccessType('none');
          setIsLoading(false);
          return;
        }

        // Default to PoC token requirement if no specific requirement
        const hasPoC = !!balances?.hasProofOfCuriosity;
        setHasAccess(hasPoC);
        setAccessType(hasPoC ? 'token' : 'none');
        setIsLoading(false);
        return;
      }

      const requiredTokenLower = requiredToken.toLowerCase();

      // Check 1: Direct HAT ownership
      const hasHatToken = (userHats || []).some(
        (hatId) => String(hatId || '').toLowerCase() === requiredTokenLower,
      );

      if (hasHatToken) {
        setHasAccess(true);
        setAccessType('hat');
        setIsLoading(false);
        return;
      }

      // Check 2: Proof of Curiosity token
      if (requiredTokenLower === POC && balances?.hasProofOfCuriosity) {
        setHasAccess(true);
        setAccessType('token');
        setIsLoading(false);
        return;
      }

      // Check 3: Role-based permissions with forumAccess
      const hasForumRole = (userRoles || []).some(
        (role) =>
          String(role.hatId || '').toLowerCase() === requiredTokenLower &&
          (role.permissions?.forumAccess || role.permissions?.chatAccess), // Allow chat access for forum too
      );

      if (hasForumRole) {
        setHasAccess(true);
        setAccessType('role');
        setIsLoading(false);
        return;
      }

      // No access granted
      setHasAccess(false);
      setAccessType('none');
      setIsLoading(false);
    } catch (err) {
      console.error('Error checking forum access:', err);
      setError(err instanceof Error ? err.message : 'Access check failed');
      setHasAccess(false);
      setAccessType('none');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkForumAccess();
  }, [
    isConnected,
    address,
    userHats,
    userRoles,
    balances,
    requiredToken,
    categoryId,
    allowPublic,
    POC,
  ]);

  return {
    hasAccess,
    isLoading,
    error,
    accessType,
    details: {
      userHats,
      userRoles,
      hasProofOfCuriosity: balances?.hasProofOfCuriosity,
      checkedRequirement: requiredToken,
    },
  };
}

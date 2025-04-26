// src/app/features/forum/hooks/useTokenGate.ts
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { fetchTokenBalances } from 'src/utils/fetchTokenBalances';

interface TokenGateResult {
  hasAccess: boolean;
  isLoading: boolean;
  error: Error | null;
  checkAccess: () => Promise<boolean>;
  tokenBalances: {
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
    systemBalance: bigint;
    selfBalance: bigint;
  } | null;
}

export function useTokenGate(): TokenGateResult {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [tokenBalances, setTokenBalances] = useState<{
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
    systemBalance: bigint;
    selfBalance: bigint;
  } | null>(null);

  const checkAccess = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    if (!isConnected || !address) {
      setHasAccess(false);
      setTokenBalances(null);
      setIsLoading(false);
      return false;
    }

    try {
      // Use existing fetchTokenBalances function
      const balances = await fetchTokenBalances(address);
      setTokenBalances(balances);
      
      // Access is granted if user has Proof of Curiosity token
      const access = balances.hasProofOfCuriosity;
      setHasAccess(access);
      setIsLoading(false);
      return access;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error checking token access'));
      setIsLoading(false);
      return false;
    }
  };

  // Verify access when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      checkAccess();
    } else {
      setHasAccess(false);
      setTokenBalances(null);
      setIsLoading(false);
    }
  }, [isConnected, address]);

  return {
    hasAccess,
    isLoading,
    error,
    checkAccess,
    tokenBalances
  };
}
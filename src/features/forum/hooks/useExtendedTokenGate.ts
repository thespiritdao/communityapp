// src/app/features/forum/hooks/useExtendedTokenGate.ts  ERC-1155
import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { fetchExtendedTokenBalances } from 'src/utils/fetchTokenBalances';

interface ExtendedTokenGateResult {
  hasAccess: boolean;
  isLoading: boolean;
  error: Error | null;
  checkAccess: () => Promise<boolean>;
  tokenBalances: {
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
    hasERC1155Token: boolean;
    systemBalance: bigint;
    selfBalance: bigint;
  } | null;
}

export function useExtendedTokenGate(
  erc1155Address?: `0x${string}`,
  tokenId?: number
): ExtendedTokenGateResult {
  const { address, isConnected } = useAccount();
  const [hasAccess, setHasAccess] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [tokenBalances, setTokenBalances] = useState<{
    hasProofOfCuriosity: boolean;
    hasMarketAdmin: boolean;
    hasERC1155Token: boolean;
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
      // Use extended token balances function
      const balances = await fetchExtendedTokenBalances(address, erc1155Address, tokenId);
      setTokenBalances(balances);
      
      // Access is granted if user has either Proof of Curiosity token or the specified ERC-1155 token
      const access = balances.hasProofOfCuriosity || balances.hasERC1155Token;
      setHasAccess(access);
      setIsLoading(false);
      return access;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error checking token access'));
      setIsLoading(false);
      return false;
    }
  };

  // Verify access when wallet connects or ERC-1155 params change
  useEffect(() => {
    if (isConnected && address) {
      checkAccess();
    } else {
      setHasAccess(false);
      setTokenBalances(null);
      setIsLoading(false);
    }
  }, [isConnected, address, erc1155Address, tokenId]);

  return {
    hasAccess,
    isLoading,
    error,
    checkAccess,
    tokenBalances
  };
}
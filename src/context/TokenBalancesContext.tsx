// src/context/TokenBalancesContext.tsx
// used for token balances throughout app without causing infura errors

import type React from 'react';
import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
} from 'react';
import {
  fetchTokenBalances,
  type TokenBalance,
} from '@/utils/fetchTokenBalances';
import { useCDPStatus } from '@/hooks/useCDPStatus';

interface TokenBalancesContextValue {
  balances: TokenBalance | null;
  refreshBalances: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

export const TokenBalancesContext = createContext<
  TokenBalancesContextValue | undefined
>(undefined);

export const TokenBalancesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { address, isInitializing } = useCDPStatus();
  const [balances, setBalances] = useState<TokenBalance | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshBalances = useCallback(async () => {
    // Don't fetch if CDP is still initializing
    if (isInitializing) {
      console.log('CDP still initializing, waiting...');
      return;
    }

    if (!address) {
      console.log('No wallet address available after initialization, skipping balance fetch');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('Fetching token balances for address:', address);
      const tokenData = await fetchTokenBalances(address);
      console.log('Successfully fetched token balances:', {
        hasProofOfCuriosity: tokenData.hasProofOfCuriosity,
        hasMarketAdmin: tokenData.hasMarketAdmin,
        hasMarketManagement: tokenData.hasMarketManagement,
        hasExecutivePod: tokenData.hasExecutivePod,
        hasDevPod: tokenData.hasDevPod,
        hasBountyHat: tokenData.hasBountyHat,
        systemBalance: tokenData.systemBalance,
        selfBalance: tokenData.selfBalance,
      });
      setBalances(tokenData);
    } catch (error) {
      console.error('Error fetching token balances:', error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  }, [address, isInitializing]);

  // Fetch balances when the address is set AND CDP is initialized
  useEffect(() => {
    // Only fetch if CDP has finished initializing
    if (!isInitializing) {
      if (address) {
        console.log('Address changed (CDP ready), refreshing balances');
        refreshBalances();
      } else {
        console.log('No address available after CDP init, clearing balances');
        setBalances(null);
      }
    }
  }, [address, isInitializing, refreshBalances]);

  return (
    <TokenBalancesContext.Provider
      value={{ balances, refreshBalances, isLoading, error }}
    >
      {children}
    </TokenBalancesContext.Provider>
  );
};

export const useTokenBalances = () => {
  const context = useContext(TokenBalancesContext);
  if (!context) {
    throw new Error(
      'useTokenBalances must be used within a TokenBalancesProvider',
    );
  }
  return context;
};

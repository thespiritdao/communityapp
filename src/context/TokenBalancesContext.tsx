// src/context/TokenBalancesContext.tsx
// used for token balances throughout app without causing infura errors 

import React, { createContext, useState, useEffect, useCallback, useContext } from "react";
import { fetchTokenBalances, TokenBalances } from "src/utils/fetchTokenBalances";
import { useAccount } from "wagmi";

interface TokenBalancesContextValue {
  balances: TokenBalances | null;
  refreshBalances: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

const TokenBalancesContext = createContext<TokenBalancesContextValue | undefined>(undefined);

export const TokenBalancesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState<TokenBalances | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshBalances = useCallback(async () => {
    if (!address) {
      console.log("No wallet address available, skipping balance fetch");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Fetching token balances for address:", address);
      const tokenData = await fetchTokenBalances(address);
      console.log("Successfully fetched token balances:", {
        hasProofOfCuriosity: tokenData.hasProofOfCuriosity,
        hasMarketAdmin: tokenData.hasMarketAdmin,
        hasMarketManagement: tokenData.hasMarketManagement,
        hasExecutivePod: tokenData.hasExecutivePod,
        hasDevPod: tokenData.hasDevPod,
        hasBountyHat: tokenData.hasBountyHat,
        systemBalance: tokenData.systemBalance,
        selfBalance: tokenData.selfBalance
      });
      setBalances(tokenData);
    } catch (error) {
      console.error("Error fetching token balances:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  // Fetch balances when the address is set (i.e. on load)
  useEffect(() => {
    if (address) {
      console.log("Address changed, refreshing balances");
      refreshBalances();
    } else {
      console.log("No address available, clearing balances");
      setBalances(null);
    }
  }, [address, refreshBalances]);

  return (
    <TokenBalancesContext.Provider value={{ balances, refreshBalances, isLoading, error }}>
      {children}
    </TokenBalancesContext.Provider>
  );
};

export const useTokenBalances = () => {
  const context = useContext(TokenBalancesContext);
  if (!context) {
    throw new Error("useTokenBalances must be used within a TokenBalancesProvider");
  }
  return context;
};

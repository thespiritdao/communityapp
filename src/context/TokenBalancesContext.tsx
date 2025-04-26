// src/contexts/TokenBalancesContext.tsx
// used for token balances throughout app without causing infura errors 

import React, { createContext, useState, useEffect, useCallback, useContext } from "react";
import { fetchTokenBalances, TokenBalances } from "src/utils/fetchTokenBalances";
import { useAccount } from "wagmi";

interface TokenBalancesContextValue {
  balances: TokenBalances | null;
  refreshBalances: () => Promise<void>;
}

const TokenBalancesContext = createContext<TokenBalancesContextValue | undefined>(undefined);

export const TokenBalancesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState<TokenBalances | null>(null);

	const refreshBalances = useCallback(async () => {
	  if (address) {
		try {
		  const tokenData = await fetchTokenBalances(address);
		  console.log("Fetched token balances:", tokenData);
		  setBalances(tokenData);
		} catch (error) {
		  console.error("Error fetching token balances:", error);
		}
	  }
	}, [address]);


  // Fetch balances when the address is set (i.e. on load)
  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  return (
    <TokenBalancesContext.Provider value={{ balances, refreshBalances }}>
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

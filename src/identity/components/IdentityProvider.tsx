import { createContext, useContext } from 'react';
import type { Address } from 'viem';
import { useValue } from '../../internal/hooks/useValue';
import { useOnchainKit } from '../../useOnchainKit';
import type { IdentityContextType, IdentityProviderReact } from '../types';

const emptyContext = {} as IdentityContextType;

export const IdentityContext = createContext<IdentityContextType>(emptyContext);

export function useIdentityContext() {
  return useContext(IdentityContext);
}

export function IdentityProvider({ address, chain, children, schemaId }: IdentityProviderReact) {
  const { chain: contextChain } = useOnchainKit();
  const accountChain = chain ?? contextChain;

  const value = useValue({
    address: address || ('' as Address),
    chain: accountChain,
    schemaId,
  });

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}
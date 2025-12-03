import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { useOnchainKit } from '../../../useOnchainKit';
import { useAttestations } from '../../../features/identity/hooks/useAttestations';
import { useIdentityContext } from './IdentityProvider';

type DisplayBadgeReact = {
  children: ReactNode;
  address?: Address;
};

export function DisplayBadge({ children, address }: DisplayBadgeReact) {
  const { chain } = useOnchainKit();
  const { address: contextAddress } = useIdentityContext();

  // schemaId is optional (can be null) - will return empty array if null
  const attestations = useAttestations({
    address: address ?? contextAddress,
    chain: chain,
    schemaId: null,
  });

  if (attestations.length === 0) {
    return null;
  }

  return children;
}

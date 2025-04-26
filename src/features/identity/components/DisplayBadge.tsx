import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { useOnchainKit } from 'src/useOnchainKit';
import { useAttestations } from 'src/features/identity/hooks/useAttestations';
import { useIdentityContext } from './IdentityProvider';

type DisplayBadgeReact = {
  children: ReactNode;
  address?: Address;
};

export function DisplayBadge({ children, address }: DisplayBadgeReact) {
  const { chain } = useOnchainKit();
  const { address: contextAddress } = useIdentityContext();

  // Update to no longer require schemaId
  const attestations = useAttestations({
    address: address ?? contextAddress,
    chain: chain,
  });

  if (attestations.length === 0) {
    return null;
  }

  return children;
}

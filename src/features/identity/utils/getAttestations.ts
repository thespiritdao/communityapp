import type { Address, Chain } from 'viem';
import { getAttestationsByFilter } from '@/network/attestations';
import type { Attestation, GetAttestationsOptions } from '../types';
import { isChainSupported } from './easSupportedChains';

/**
 * Fetches Ethereum Attestation Service (EAS) attestations for a given address and chain,
 * optionally filtered by schemas associated with the attestation.
 */
export async function getAttestations(
  address: Address,
  chain: Chain,
  options?: GetAttestationsOptions,
): Promise<Attestation[]> {
  if (!isChainSupported(chain)) {
    return [];
  }
  try {
    // Default query filter values
    const defaultQueryVariablesFilter = {
      revoked: false,
      expirationTime: Math.round(Date.now() / 1000),
      limit: 10,
    };
    const queryVariablesFilter = { ...defaultQueryVariablesFilter, ...options };
    return await getAttestationsByFilter(address, chain, queryVariablesFilter);
  } catch (error) {
    // Silent fail for attestation errors
    return [];
  }
}

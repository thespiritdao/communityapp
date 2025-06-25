// //src/nft/utils/builtMintTransactionData.ts

import type { Address } from 'viem';
import type { Call } from 'src/transaction/types';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';
import type { BuildMintTransactionParams } from 'src/api/types';
import { buildMintTransaction as genericBuild } from 'src/api/buildMintTransaction';

const ADVOCATE_ADDRESS = '0xd05b10248f1F72e8B9fEbd9E9c87887Ab0a1aAB0'.toLowerCase();

/**
 * A single builder that:
 * - If you pass in your AdvocateMembership contract, throws (we override it in AdvocateMintCard)
 * - Otherwise routes through your existing API to build a mint transaction
 */
export async function buildMintTransactionData({
  contractAddress,
  takerAddress,
  tokenId,
  quantity,
  network,
}: { contractAddress: Address } & BuildMintTransactionParams): Promise<Call[]> {
  if (contractAddress.toLowerCase() === ADVOCATE_ADDRESS) {
    throw new Error(
      'AdvocateMintCard overrides buildMintTransaction directly. Do not call generic builder for Advocate.'
    );
  }

  // Fallback: generic API-driven flow
  const result = await genericBuild({
    mintAddress: contractAddress,
    takerAddress,
    tokenId,
    quantity,
    network,
  });

  if ('error' in result) {
    throw new Error(result.message);
  }

  return [
    {
      to:    result.call_data.to,
      data:  result.call_data.data,
      value: BigInt(result.call_data.value),
    },
  ];
}

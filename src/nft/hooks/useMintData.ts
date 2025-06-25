//src/nft/hooks/useMintData.ts
'use client';

import { useState, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { useNFTLifecycleContext } from 'src/nft/components/NFTLifecycleProvider';
import type { NFTData, NFTError } from 'src/nft/types';
import { convertIpfsToHttps } from 'src/nft/utils/ipfs';
import { useMintDetails } from 'src/nft/hooks/useMintDetails';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';

const ADVOCATE_ADDRESS = '0xd05b10248f1F72e8B9fEbd9E9c87887Ab0a1aAB0'.toLowerCase();

/**
 * A single hook that:
 * - If you pass in your AdvocateMembership contract, it does an on‐chain balanceOf to gate eligibility,
 *   and returns a minimal NFTData (name/description/price=0/isEligibleToMint).
 * - Otherwise falls back to your existing REST/API-powered flow via useMintDetails().
 */
export function useMintData(
  contractAddress: `0x${string}`,
  tokenId?: string,
): NFTData | NFTError {
  const { updateLifecycleStatus } = useNFTLifecycleContext();
  const { address } = useAccount();
  const publicClient = usePublicClient();

  // 1) Advocate-specific on-chain path
  if (contractAddress.toLowerCase() === ADVOCATE_ADDRESS) {
    const [error, setError] = useState<NFTError | null>(null);
    const [isEligibleToMint, setIsEligibleToMint] = useState(false);

    useEffect(() => {
      if (!address) return;
      publicClient
        .readContract({
          address: contractAddress,
          abi: AdvocateMembershipABI,
          functionName: 'balanceOf',
          args: [address],
        })
        .then((bal: bigint) => {
          setIsEligibleToMint(bal === 0n);
        })
        .catch((err) => {
          const nftErr: NFTError = {
            code: 'AdvMD01',
            message: (err as Error).message,
            error: 'Error checking eligibility on-chain',
          };
          setError(nftErr);
          updateLifecycleStatus({ statusName: 'error', statusData: nftErr });
        });
    }, [address, contractAddress, publicClient, updateLifecycleStatus]);

    // If we hit an error, bubble it immediately
    if (error) return error;

    return {
      // fill in whatever metadata you like
      name: 'Advocate Membership',
      description: 'Mint to join the Advocate DAO and unlock on-chain voting.',
      imageUrl: '',           // optional: your default image
      animationUrl: undefined,
      mimeType: undefined,
      contractType: 'ERC721',
      maxMintsPerWallet: 1,
      price: 0n,
      mintFee: 0n,
      isEligibleToMint,
      creatorAddress: undefined,
      totalOwners: undefined,
      network: undefined,
    };
  }

  // 2) Fallback: your generic, REST/API-based path
  const [error, setError] = useState<NFTError | null>(null);
  const { error: mintError, data: mintData } = useMintDetails({
    contractAddress,
    takerAddress: address,
    ...(tokenId ? { tokenId } : {}),
  });

  useEffect(() => {
    if (mintError) {
      const nftErr: NFTError = {
        code: 'NmMD01',
        message: mintError.message,
        error: 'Error fetching mint data',
      };
      setError(nftErr);
      updateLifecycleStatus({ statusName: 'error', statusData: nftErr });
    }
  }, [mintError, updateLifecycleStatus]);

  if (error) return error;

  return {
    name:                 mintData?.name,
    description:          mintData?.description,
    imageUrl:             convertIpfsToHttps(mintData?.imageUrl),
    animationUrl:         convertIpfsToHttps(mintData?.animationUrl),
    mimeType:             mintData?.mimeType,
    contractType:         mintData?.contractType,
    maxMintsPerWallet:    mintData?.maxMintsPerWallet === 0 ? undefined : mintData?.maxMintsPerWallet,
    price:                mintData?.price,
    mintFee:              mintData?.mintFee,
    isEligibleToMint:     mintData?.isEligibleToMint,
    creatorAddress:       mintData?.creatorAddress,
    totalOwners:          mintData?.totalOwners,
    network:              mintData?.network,
  };
}

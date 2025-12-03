'use client';
import type React from 'react';
import { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { usePublicClient } from 'wagmi';
import { erc721ABI } from '@/utils/erc721ABI';
import { erc1155ABI } from '@/utils/erc1155ABI';
import { UNLOCK_PUBLIC_LOCK_ABI } from '@/app/api/utils/contractABI';
import { ethers } from 'ethers';
import Image from 'next/image';
import { LocalTokenService } from '../services/localTokenService';
import { usePodCredentials } from '../hooks/usePodCredentials';

type TokenType = 'erc721' | 'erc1155' | 'unlock';

interface TokenConfig {
  address: string;
  tokenId?: string;
  type: TokenType;
  label: string;
  category: 'membership' | 'credential';
  metadataUrl?: string;
}

interface TokenGalleryProps {
  walletAddress: string;
  category: 'membership' | 'credential';
}

// === Token Configuration (Add new tokens here) ===
// NOTE: Hardcoded "Dev Pod" and "Executive Pod" entries removed
// Pod memberships are now managed dynamically via the unified pod system
// Users can see their pod memberships in pod-specific interfaces
const TOKEN_CONFIGS: TokenConfig[] = [
  // === Membership Tokens ===
  {
    address:
      process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY ||
      '0x756d2ad6642c2ed43fd87af70d83f277ec0a669f',
    type: 'erc721',
    label: 'Proof of Curiosity',
    category: 'membership',
  },

  {
    address:
      process.env.NEXT_PUBLIC_ADVOCATE ||
      '0xe4a2f419b4531417cb18d7ad95527eea620c4095',
    type: 'erc721',
    label: 'Advocate',
    category: 'membership',
  },

  // === Credential Tokens ===
  // Note: Pod-specific credentials (hats) are dynamically managed
  // and displayed in pod interfaces, not in the identity modal

  // === Add new static tokens here ===
  // Only add tokens that are universal/community-wide (not pod-specific)
  /*
  {
    address: '0xAnotherTokenAddress',
    tokenId: '0xOptionalTokenId',
    type: 'erc721' | 'erc1155' | 'unlock',
    label: 'Your Token Name',
    category: 'membership' | 'credential',
    metadataUrl: 'https://your-metadata-url.com/token-id'
  }
  */
];

export const TokenGallery: React.FC<TokenGalleryProps> = ({
  walletAddress,
  category,
}) => {
  const [tokenMetadata, setTokenMetadata] = useState<
    Array<{ uri: string; image: string; name: string; owned: boolean }>
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get dynamic pod credentials for credentials category
  const { credentials: podCredentials, isLoading: credentialsLoading } =
    usePodCredentials(category === 'credential' ? walletAddress : undefined);

  const categoryTokens = TOKEN_CONFIGS.filter(
    (token) => token.category === category,
  );

  const contractReads = categoryTokens.map((token) => {
    if (token.type === 'erc721') {
      return {
        address: token.address as `0x${string}`,
        abi: erc721ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      };
    } else if (token.type === 'erc1155') {
      return {
        address: token.address as `0x${string}`,
        abi: erc1155ABI,
        functionName: 'balanceOf',
        args: [walletAddress, token.tokenId],
      };
    } else if (token.type === 'unlock') {
      return {
        address: token.address as `0x${string}`,
        abi: UNLOCK_PUBLIC_LOCK_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      };
    }
  });

  // Handle empty token configs (e.g., credentials with no static tokens)
  const hasTokensToCheck = contractReads.length > 0;

  const {
    data: ownershipData,
    isError,
    isLoading: isContractLoading,
  } = useReadContracts({
    contracts: contractReads as any[],
    query: {
      enabled: hasTokensToCheck, // Only run if we have tokens to check
    },
  });

  const publicClient = usePublicClient();

  const fetchTokenMetadata = async () => {
    setIsLoading(true);
    const results = await Promise.all(
      categoryTokens.map(async (token, index) => {
        try {
          const balance = ownershipData?.[index]?.result;
          const owned =
            typeof balance === 'bigint'
              ? balance > 0n
              : typeof balance === 'number'
                ? balance > 0
                : false;
          if (!owned)
            return { uri: '', image: '', name: token.label, owned: false };

          // Check if we should use local token data first
          if (LocalTokenService.shouldUseLocalMetadata(token.label)) {
            const localToken = LocalTokenService.getTokenInfo(token.label);
            if (localToken) {
              return {
                uri: '',
                image: localToken.image,
                name: localToken.name,
                owned: true,
              };
            }
          }

          let tokenURI = '';
          let imageUrl = '';
          let tokenName = token.label;

          if (!publicClient) {
            return { uri: '', image: '', name: token.label, owned: true };
          }

          const provider = new ethers.JsonRpcProvider(
            publicClient.transport.url,
          );
          if (token.type === 'erc721') {
            const contract = new ethers.Contract(
              token.address,
              erc721ABI,
              provider,
            );
            const tokenId = await contract
              .tokenOfOwnerByIndex(walletAddress, 0)
              .catch(() => null);
            if (tokenId) {
              tokenURI = await contract.tokenURI(tokenId);
            }
          } else if (token.type === 'erc1155') {
            const contract = new ethers.Contract(
              token.address,
              erc1155ABI,
              provider,
            );
            tokenURI = await contract.uri(token.tokenId).catch(() => '');
            if (tokenURI && token.tokenId) {
              const formattedId = token.tokenId.slice(2).padStart(64, '0');
              tokenURI = tokenURI.replace('{id}', formattedId);
            }
          } else if (token.type === 'unlock') {
            if (!token.metadataUrl)
              throw new Error('Missing metadata URL for Unlock token');
            tokenURI = token.metadataUrl;
          }

          let metadata;

          if (tokenURI.startsWith('data:application/json;base64,')) {
            // Handle base64 encoded JSON metadata to avoid CSP violations
            const base64Data = tokenURI.replace(
              'data:application/json;base64,',
              '',
            );
            const jsonString = atob(base64Data);
            metadata = JSON.parse(jsonString);
          } else {
            if (tokenURI.startsWith('ipfs://')) {
              tokenURI = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
            }

            try {
              const response = await fetch(tokenURI);
              const text = await response.text();

              // Check if response is valid JSON
              if (
                text.trim().startsWith('<!DOCTYPE') ||
                text.trim().startsWith('<html')
              ) {
                throw new Error('Received HTML instead of JSON metadata');
              }

              metadata = JSON.parse(text);
            } catch (jsonError) {
              // Use local token image as fallback
              const fallbackImage = LocalTokenService.getTokenImage(
                token.label,
              );
              return {
                uri: '',
                image: fallbackImage,
                name: token.label,
                owned: true,
              };
            }
          }

          imageUrl = metadata.image || '';

          // Handle IPFS images by replacing with local versions
          if (imageUrl.startsWith('ipfs://')) {
            imageUrl = LocalTokenService.getTokenImage(token.label, imageUrl);
          } else if (!imageUrl) {
            imageUrl = LocalTokenService.getTokenImage(token.label);
          }
          const metadataName = metadata.name?.toLowerCase();
          const isGeneric =
            !metadataName || ['hat', 'token', 'nft'].includes(metadataName);
          tokenName = isGeneric ? token.label : metadata.name;

          return {
            uri: tokenURI,
            image: imageUrl,
            name: tokenName,
            owned: true,
          };
        } catch (error) {
          // Always fall back to local image for errors
          const fallbackImage = LocalTokenService.getTokenImage(token.label);
          return {
            uri: '',
            image: fallbackImage,
            name: token.label,
            owned: false,
          };
        }
      }),
    );

    setTokenMetadata(results);
    setIsLoading(false);
  };

  useEffect(() => {
    // If no tokens to check, immediately set loading to false
    if (!hasTokensToCheck) {
      setIsLoading(false);
      setTokenMetadata([]);
      return;
    }

    // Otherwise, wait for contract reads to complete
    if (ownershipData && !isContractLoading) {
      fetchTokenMetadata();
    }
  }, [ownershipData, isContractLoading, hasTokensToCheck]);

  // Show loading state
  if (isLoading || isContractLoading || credentialsLoading) {
    return <div className="loading">Loading {category} tokens...</div>;
  }

  // For credentials, show dynamic pod credentials
  if (category === 'credential') {
    console.log('[TokenGallery] Rendering credentials:', podCredentials.length);

    if (podCredentials.length === 0) {
      return <div className="no-tokens">No credential tokens found</div>;
    }

    return (
      <div className="token-gallery">
        {podCredentials.map((credential, index) => (
          <div key={index} className="token-card">
            {credential.image ? (
              <div className="token-image">
                <Image
                  src={LocalTokenService.sanitizeImageUrl(
                    credential.image,
                    credential.label,
                  )}
                  alt={credential.label}
                  width={60}
                  height={60}
                  className="rounded-full object-cover"
                  unoptimized={
                    credential.image?.includes('ui-avatars.com') ||
                    credential.image?.includes('supabase') ||
                    false
                  }
                />
              </div>
            ) : (
              <div className="token-placeholder">
                <div className="placeholder-text">{credential.label}</div>
              </div>
            )}
            <div className="token-name">{credential.label}</div>
          </div>
        ))}
      </div>
    );
  }

  // For membership tokens, use contract-based checking
  const ownedTokens = tokenMetadata.filter((token) => token.owned);

  if (ownedTokens.length === 0) {
    return <div className="no-tokens">No {category} tokens found</div>;
  }

  return (
    <div className="token-gallery">
      {ownedTokens.map((token, index) => (
        <div key={index} className="token-card">
          {token.image ? (
            <div className="token-image">
              <Image
                src={LocalTokenService.sanitizeImageUrl(
                  token.image,
                  token.name,
                )}
                alt={token.name}
                width={60}
                height={60}
                className="rounded-full object-cover"
                unoptimized={
                  token.image?.includes('ui-avatars.com') ||
                  token.image?.startsWith('ipfs://') ||
                  false
                }
              />
            </div>
          ) : (
            <div className="token-placeholder">
              <div className="placeholder-text">{token.name}</div>
            </div>
          )}
          <div className="token-name">{token.name}</div>
        </div>
      ))}
    </div>
  );
};

'use client';
import React, { useState, useEffect } from 'react';
import { useReadContracts } from 'wagmi';
import { erc721ABI } from '@/utils/erc721ABI';
import { erc1155ABI } from '@/utils/erc1155ABI';
import { erc20ABI } from '@/utils/erc20ABI';
import Image from 'next/image';
import {
  DatabaseTokenService,
  OFFCHAIN_TOKEN_SOURCES,
  type DatabaseToken,
} from '../services/databaseTokenService';

// Helper function to convert IPFS URLs to HTTP gateway URLs
const convertIpfsUrl = (url: string): string => {
  if (!url) return '/images/symbolobinfin.png';

  // If it's already an HTTP URL, return as-is
  if (url.startsWith('http')) {
    return url;
  }

  // Convert IPFS protocol URLs to gateway URLs
  if (url.startsWith('ipfs://')) {
    const hash = url.replace('ipfs://', '');
    return `https://ipfs.io/ipfs/${hash}`;
  }

  // If it starts with /ipfs/, prepend gateway
  if (url.startsWith('/ipfs/')) {
    return `https://ipfs.io${url}`;
  }

  // Return original URL or fallback
  return url || '/images/symbolobinfin.png';
};

interface DatabaseTokenGalleryProps {
  walletAddress: string;
  category: 'membership' | 'credential' | 'accreditation';
}

interface TokenWithBalance extends DatabaseToken {
  balance: bigint;
  owned: boolean;
}

export const DatabaseTokenGallery: React.FC<DatabaseTokenGalleryProps> =
  React.memo(({ walletAddress, category }) => {
    const [tokens, setTokens] = useState<DatabaseToken[]>([]);
    const [tokenBalances, setTokenBalances] = useState<TokenWithBalance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load tokens from database
    useEffect(() => {
      const loadTokens = async () => {
        try {
          setIsLoading(true);
          setError(null);

          const dbTokens = await DatabaseTokenService.getAllTokensForUser(
            walletAddress,
            category,
          );

          setTokens(dbTokens);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Failed to load tokens',
          );
          setTokens([]);
        } finally {
          setIsLoading(false);
        }
      };

      // Only load tokens if walletAddress is provided
      // Note: Parent component should handle CDP initialization timing
      if (walletAddress) {
        loadTokens();
      } else {
        setIsLoading(false); // Don't show loading if no wallet address
      }
    }, [walletAddress, category]);

    // Prepare contract reads for checking balances. Off-chain sources
    // (event_tokens, accreditations) have no contract; skip them so an empty
    // address never reaches wagmi. Indexes below map back via onchainTokens.
    const onchainTokens = tokens.filter((t) => !OFFCHAIN_TOKEN_SOURCES.has(t.source));
    const contractReads = onchainTokens.map((token) => {
      const baseContract = {
        address: token.contract_address as `0x${string}`,
        args: [walletAddress] as const,
      };

      switch (token.token_type) {
        case 'erc20':
          return {
            ...baseContract,
            abi: erc20ABI,
            functionName: 'balanceOf',
          };
        case 'erc721':
          return {
            ...baseContract,
            abi: erc721ABI,
            functionName: 'balanceOf',
          };
        case 'erc1155':
          return {
            address: token.contract_address as `0x${string}`,
            abi: erc1155ABI,
            functionName: 'balanceOf',
            args: [walletAddress, token.token_address || '0x0'] as const,
          };
        default:
          // For ERC721 tokens from tokens table, just check balanceOf
          return {
            ...baseContract,
            abi: erc721ABI,
            functionName: 'balanceOf',
          };
      }
    });

    const {
      data: ownershipData,
      isError: contractError,
      isLoading: isContractLoading,
    } = useReadContracts({
      contracts: contractReads as any[],
      query: {
        enabled: onchainTokens.length > 0,
      },
    });

    // Process ownership data
    useEffect(() => {
      if (ownershipData && !isContractLoading && onchainTokens.length > 0) {
        const tokensWithBalances: TokenWithBalance[] = onchainTokens.map(
          (token, index) => {
            const balanceResult = ownershipData[index];
            const balance = balanceResult?.result || 0n;
            const owned =
              typeof balance === 'bigint' ? balance > 0n : Number(balance) > 0;

            // Convert balance to bigint safely
            let balanceValue: bigint;
            if (typeof balance === 'bigint') {
              balanceValue = balance;
            } else if (
              typeof balance === 'number' ||
              typeof balance === 'string'
            ) {
              balanceValue = BigInt(balance || 0);
            } else {
              balanceValue = 0n;
            }

            return {
              ...token,
              balance: balanceValue,
              owned,
            };
          },
        );

        setTokenBalances(tokensWithBalances);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownershipData, isContractLoading, tokens, category]);

    // Render loading state (no contract read is pending when every token is off-chain)
    if (isLoading || (isContractLoading && onchainTokens.length > 0)) {
      return (
        <div className="loading">
          <p>Loading {category} tokens from database...</p>
        </div>
      );
    }

    // Render error state
    if (error) {
      return (
        <div className="error">
          <p>Error: {error}</p>
          <p>Falling back to hardcoded tokens...</p>
        </div>
      );
    }

    // Render no tokens state
    if (contractError) {
    }

    // Accreditations are a mix of sources with different ownership semantics:
    //  - event_tokens and accreditations rows are per-user — their presence
    //    IS ownership, no on-chain check needed.
    //  - tokens-table rows (e.g. Advocate, re-homed to 'accreditation') are
    //    global definitions shown to every user — they MUST pass the on-chain
    //    balance check or every profile shows badges the member doesn't hold.
    if (category === 'accreditation') {
      const visibleAccreditations = tokens.filter((token) => {
        if (OFFCHAIN_TOKEN_SOURCES.has(token.source)) return true;
        const withBalance = tokenBalances.find((t) => t.id === token.id);
        return withBalance?.owned === true;
      });
      if (visibleAccreditations.length === 0) {
        return (
          <div className="no-tokens">
            <p>No accreditations yet</p>
          </div>
        );
      }
      return (
        <div className="token-gallery">
          {visibleAccreditations.map((token) => (
            <div key={token.id} className="token-card">
              <div
                className="token-image"
                style={{
                  backgroundImage: `url(${convertIpfsUrl(token.token_image)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                role="img"
                aria-label={token.name}
              />
              <div className="token-info">
                <div className="token-name">{token.name}</div>
                {token.source === 'accreditations' && token.description && (
                  <div className="token-description" style={{ fontSize: '12px', opacity: 0.75 }}>
                    {token.description}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      );
    }

    const ownedTokens = tokenBalances.filter((token) => token.owned);

    if (ownedTokens.length === 0) {
      return (
        <div className="no-tokens">
          <p>No {category} tokens found</p>
        </div>
      );
    }

    return (
      <div className="token-gallery">
        {ownedTokens.map((token, index) => (
          <div key={token.id} className="token-card">
            <div
              className="token-image"
              style={{
                backgroundImage: `url(${convertIpfsUrl(token.token_image)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
              role="img"
              aria-label={token.name}
            />
            <div className="token-info">
              <div className="token-name">
                {token.source === 'pod_roles' && token.role_name
                  ? token.role_name
                  : token.name}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  });

DatabaseTokenGallery.displayName = 'DatabaseTokenGallery';

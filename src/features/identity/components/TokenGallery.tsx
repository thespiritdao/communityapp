'use client';
import React, { useState, useEffect } from 'react';
import { useContractReads } from 'wagmi';
import { usePublicClient } from 'wagmi';
import { erc721ABI } from 'src/utils/erc721ABI';
import { erc1155ABI } from 'src/utils/erc1155ABI';
import { UNLOCK_PUBLIC_LOCK_ABI } from 'src/app/api/utils/contractABI';
import { ethers } from 'ethers';
import Image from 'next/image';

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
const TOKEN_CONFIGS: TokenConfig[] = [
  // === Membership Tokens ===
  {
    address: process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY || '0x756d2ad6642c2ed43fd87af70d83f277ec0a669f',
    type: 'erc721',
    label: 'Proof of Curiosity',
    category: 'membership',
  },
  
  {
    address: process.env.NEXT_PUBLIC_ADVOCATE || '0xe4a2f419b4531417cb18d7ad95527eea620c4095',
    type: 'erc721',
    label: 'Advocate',
    category: 'membership',
  },


  // === Credential Tokens ===
  {
    address: process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137',
    tokenId: process.env.NEXT_PUBLIC_EXECUTIVE_POD_HAT_ID || '0x0000008800010000000000000000000000000000000000000000000000000000',
    type: 'erc1155',
    label: 'Executive Pod',
    category: 'credential',
  },
  {
    address: process.env.NEXT_PUBLIC_HATS_CONTRACT || '0x3bc1a0ad72417f2d411118085256fc53cbddd137',
    tokenId: process.env.NEXT_PUBLIC_DEV_POD_HAT_ID || '0x0000008800020000000000000000000000000000000000000000000000000000',
    type: 'erc1155',
    label: 'Dev Pod',
    category: 'credential',
  },

  // === Add new tokens here ===
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

export const TokenGallery: React.FC<TokenGalleryProps> = ({ walletAddress, category }) => {
  const [tokenMetadata, setTokenMetadata] = useState<Array<{ uri: string; image: string; name: string; owned: boolean }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const categoryTokens = TOKEN_CONFIGS.filter(token => token.category === category);

  const contractReads = categoryTokens.map(token => {
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

  const { data: ownershipData, isError, isLoading: isContractLoading } = useContractReads({
    contracts: contractReads as any[],
  });
  
  const publicClient = usePublicClient();

  const fetchTokenMetadata = async () => {
    setIsLoading(true);
    const results = await Promise.all(
      categoryTokens.map(async (token, index) => {
        try {
          const balance = ownershipData?.[index]?.result;
          const owned = balance && (typeof balance === 'bigint' ? balance > 0n : balance > 0);
          if (!owned) return { uri: '', image: '', name: token.label, owned: false };

          let tokenURI = '';
          let imageUrl = '';
          let tokenName = token.label;

			if (!publicClient) {
			  console.error('Wagmi publicClient not available');
			  return { uri: '', image: '', name: token.label, owned: true };
			}

			const provider = new ethers.providers.JsonRpcProvider(publicClient.transport.url);
          if (token.type === 'erc721') {
            const contract = new ethers.Contract(token.address, erc721ABI, provider);
            const tokenId = await contract.tokenOfOwnerByIndex(walletAddress, 0).catch(() => null);
            if (tokenId) {
              tokenURI = await contract.tokenURI(tokenId);
            }
          } else if (token.type === 'erc1155') {
            const contract = new ethers.Contract(token.address, erc1155ABI, provider);
            tokenURI = await contract.uri(token.tokenId).catch(() => '');
            if (tokenURI && token.tokenId) {
              const formattedId = token.tokenId.slice(2).padStart(64, '0');
              tokenURI = tokenURI.replace('{id}', formattedId);
            }
          } else if (token.type === 'unlock') {
            if (!token.metadataUrl) throw new Error('Missing metadata URL for Unlock token');
            tokenURI = token.metadataUrl;
          }

          if (tokenURI.startsWith('ipfs://')) {
            tokenURI = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
          }

          const response = await fetch(tokenURI);
          const metadata = await response.json();

          imageUrl = metadata.image || '';
          if (imageUrl.startsWith('ipfs://')) {
            imageUrl = imageUrl.replace('ipfs://', 'https://ipfs.io/ipfs/');
          }
          const metadataName = metadata.name?.toLowerCase();
		  const isGeneric = !metadataName || ['hat', 'token', 'nft'].includes(metadataName);
		  tokenName = isGeneric ? token.label : metadata.name;


          return {
            uri: tokenURI,
            image: imageUrl,
            name: tokenName,
            owned: true,
          };
        } catch (error) {
          console.error(`Error fetching metadata for ${token.label}:`, error);
          return { uri: '', image: '', name: token.label, owned: false };
        }
      })
    );

    setTokenMetadata(results);
    setIsLoading(false);
  };

  useEffect(() => {
    if (ownershipData && !isContractLoading) {
      fetchTokenMetadata();
    }
  }, [ownershipData, isContractLoading]);

  if (isLoading || isContractLoading) {
    return <div className="loading">Loading {category} tokens...</div>;
  }

  const ownedTokens = tokenMetadata.filter(token => token.owned);

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
				  src={token.image} 
				  alt={token.name} 
				  width={60} 
				  height={60} 
				  className="rounded-full object-cover" 
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

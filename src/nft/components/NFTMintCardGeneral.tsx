// src/components/NFTMintCardGeneral.tsx
'use client';
import React from 'react';
import { useAccount } from 'wagmi';
import {
  Transaction,
  TransactionButton,
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction,
} from '@coinbase/onchainkit/transaction';
import { cn } from 'src/styles/theme';

export interface NFTMintCardGeneralProps {
  contractAddress: string;
  abi: any;
  mintArgs: any[]; // Arguments for the mint function, e.g. [address, memberType, tokenURI]
  chainId?: number; // Default to 8453 (Base)
  isSponsored?: boolean;
  mediaUrl?: string;
  collectionName?: string;
  title?: string;
  description?: string;
  costLabel?: string;
  onSuccess?: (txHash: string) => void;
  onError?: (error: any) => void;
  className?: string;
}

export function NFTMintCardGeneral({
  contractAddress,
  abi,
  mintArgs,
  chainId = 8453,
  isSponsored = true,
  mediaUrl,
  collectionName,
  title,
  description,
  costLabel,
  onSuccess,
  onError,
  className,
}: NFTMintCardGeneralProps) {
  const { address, isConnected } = useAccount();

  // Check for valid arguments
  const isArgsValid = Array.isArray(mintArgs) && mintArgs.every(arg => arg !== undefined && arg !== null);

  const contracts = isConnected && isArgsValid
    ? [{
        address: contractAddress,
        abi,
        functionName: 'mint',
        args: mintArgs,
      }]
    : [];

  return (
    <div className={cn("bg-white rounded-2xl shadow-lg p-6 w-full max-w-md", className)}>
      {/* Media/Preview */}
      {mediaUrl && (
        <img src={mediaUrl} alt={title || "NFT"} className="rounded-xl mb-4 object-cover w-full h-64" />
      )}

      {/* Collection and Title */}
      {collectionName && (
        <div className="text-xs text-blue-500 font-medium mb-1">{collectionName}</div>
      )}
      {title && (
        <div className="text-lg font-bold mb-2">{title}</div>
      )}
      {description && (
        <div className="text-gray-500 text-sm mb-4">{description}</div>
      )}

      {/* Cost */}
      {costLabel && (
        <div className="mb-2">
          <span className="font-semibold text-green-600">{costLabel}</span>
        </div>
      )}

      {/* Mint Button & Status */}
      {isConnected ? (
        <Transaction
          isSponsored={isSponsored}
          address={address}
          contracts={contracts}
          chainId={chainId}
          onSuccess={onSuccess}
          onError={onError}
          onProgress={step => console.log('[NFTMintCardGeneral] step →', step)}
        >
          <TransactionButton
            text="Mint NFT"
            className="px-4 py-2 bg-blue-600 text-white rounded w-full disabled:opacity-50"
          />
          <TransactionSponsor />
          <TransactionStatus>
            <TransactionStatusLabel />
            <TransactionStatusAction />
          </TransactionStatus>
        </Transaction>
      ) : (
        <button disabled className="px-4 py-2 bg-gray-400 text-white rounded w-full opacity-50">
          Connect wallet to mint
        </button>
      )}
    </div>
  );
}

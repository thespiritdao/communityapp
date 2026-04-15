// src/components/NFTMintCardGeneral.tsx
'use client';
import { useState, useCallback } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';
import { cn } from '@/lib/utils';

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
  onSuccess?: (response: any) => void;
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
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const [isMinting, setIsMinting] = useState(false);

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;
  const isConnected = Boolean(currentUser);

  // Check for valid arguments
  const isArgsValid =
    Array.isArray(mintArgs) &&
    mintArgs.every((arg) => arg !== undefined && arg !== null);

  // CDP transaction handler for NFT minting
  const handleCDPMint = useCallback(async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      console.error('Smart Account not found');
      return;
    }

    if (!isArgsValid) {
      console.error('Invalid mint arguments');
      return;
    }

    setIsMinting(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];

      const callData = encodeFunctionData({
        abi,
        functionName: 'mint',
        args: mintArgs,
      });

      console.log('🚀 CDP NFT Mint:', {
        smartAccount,
        contractAddress,
        args: mintArgs,
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: contractAddress as `0x${string}`,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: isSponsored,
      });

      console.log('✅ NFT minted:', result);

      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error: any) {
      console.error('❌ NFT minting failed:', error);
      if (onError) {
        onError(error);
      }
    } finally {
      setIsMinting(false);
    }
  }, [currentUser, isArgsValid, abi, mintArgs, contractAddress, isSponsored, sendUserOperation, onSuccess, onError]);

  return (
    <div
      className={cn(
        'bg-white rounded-2xl shadow-lg p-6 w-full max-w-md',
        className,
      )}
    >
      {/* Media/Preview */}
      {mediaUrl && (
        <img
          src={mediaUrl}
          alt={title || 'NFT'}
          className="rounded-xl mb-4 object-cover w-full h-64"
        />
      )}

      {/* Collection and Title */}
      {collectionName && (
        <div className="text-xs text-blue-500 font-medium mb-1">
          {collectionName}
        </div>
      )}
      {title && <div className="text-lg font-bold mb-2">{title}</div>}
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
        <button
          onClick={handleCDPMint}
          disabled={isMinting || !isArgsValid}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded w-full disabled:opacity-50"
        >
          {isMinting ? 'Minting...' : isSponsored ? 'Mint NFT (Gasless)' : 'Mint NFT'}
        </button>
      ) : (
        <button
          disabled={true}
          className="px-4 py-2 bg-gray-400 text-white rounded w-full opacity-50"
        >
          Connect wallet to mint
        </button>
      )}
    </div>
  );
}

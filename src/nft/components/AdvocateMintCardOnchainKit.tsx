// src/nft/components/AdvocateMintCardOnchainKit.tsx
'use client';

import { useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { encodeFunctionData } from 'viem';
import AdvocateMembershipABI from '../../../abis/AdvocateMembershipABI.json';
import { Button } from '@/components/ui/button';

interface AdvocateMintCardOnchainKitProps {
  address: `0x${string}`;
  contractAddress: `0x${string}`;
  memberType: number;
  tokenURI: string;
  onSuccess?: () => void;
  onError?: (error: any) => void;
}

export function AdvocateMintCardOnchainKit({
  address,
  contractAddress,
  memberType,
  tokenURI,
  onSuccess,
  onError,
}: AdvocateMintCardOnchainKitProps) {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation, status, error: txError } = useSendUserOperation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!address) return null;

  const handleMint = async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      const error = new Error('Smart account not available');
      setErrorMsg('Smart account not available. Please ensure your wallet is connected.');
      onError?.(error);
      return;
    }

    try {
      setErrorMsg(null);

      // Encode the mint function call
      const data = encodeFunctionData({
        abi: AdvocateMembershipABI,
        functionName: 'mint',
        args: [address, memberType, tokenURI],
      });

      // Send sponsored transaction
      const result = await sendUserOperation({
        evmSmartAccount: currentUser.evmSmartAccounts[0] as `0x${string}`,
        network: 'base',
        calls: [{
          to: contractAddress,
          data,
          value: 0n,
        }],
      });

      console.log('✅ NFT minted successfully:', result);
      onSuccess?.();
    } catch (err) {
      console.error('❌ NFT minting failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Minting failed';
      setErrorMsg(errorMessage);
      onError?.(err);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        onClick={handleMint}
        disabled={status === 'pending' || !address}
        className="w-full"
      >
        {status === 'pending' ? '⏳ Minting...' : 'Mint Membership NFT'}
      </Button>

      {status === 'pending' && (
        <div className="text-sm text-blue-600 text-center">
          🔄 Transaction in progress... (Sponsored)
        </div>
      )}

      {(errorMsg || txError) && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
          ❌ {errorMsg || txError?.message}
        </div>
      )}

      {status === 'success' && (
        <div className="text-sm text-green-600 bg-green-50 p-2 rounded border border-green-200">
          ✅ NFT minted successfully!
        </div>
      )}
    </div>
  );
}

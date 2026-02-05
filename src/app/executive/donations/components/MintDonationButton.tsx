'use client';

import React, { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, getAddress } from 'viem';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const SYSTEM_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_SYSTEM_TOKEN!;

const SYSTEM_TOKEN_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

interface MintDonationButtonProps {
  donationId: string;
  recipientAddress: string;
  amount: number; // Amount in $SYSTEM tokens (not wei)
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export const MintDonationButton: React.FC<MintDonationButtonProps> = ({
  donationId,
  recipientAddress,
  amount,
  onSuccess,
  onError,
}) => {
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const [isMinting, setIsMinting] = useState(false);

  const handleMint = async () => {
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      onError?.('Smart Wallet not connected');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0];

    setIsMinting(true);

    try {
      console.log('🪙 Minting $SYSTEM tokens (gasless):', {
        recipient: recipientAddress,
        amount,
        donationId,
      });

      // Convert amount to wei (18 decimals)
      const amountInWei = BigInt(Math.floor(amount * 1e18));

      // Encode mint function call
      const mintCallData = encodeFunctionData({
        abi: SYSTEM_TOKEN_ABI,
        functionName: 'mint',
        args: [getAddress(recipientAddress), amountInWei],
      });

      console.log('🚀 Sending gasless user operation...');

      // Send user operation with paymaster (gasless)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: SYSTEM_TOKEN_ADDRESS as `0x${string}`,
          value: 0n,
          data: mintCallData as `0x${string}`,
        }],
        useCdpPaymaster: true, // ← GASLESS!
      });

      console.log('✅ User operation submitted:', result);

      // Update backend with mint status
      const response = await fetch('/api/donations/mint/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donationId,
          userOpHash: (result as any).userOperationHash,
          minter: evmAddress,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to record mint transaction');
      }

      console.log('✅ Mint recorded in database');
      onSuccess?.();

    } catch (error: any) {
      console.error('❌ Minting failed:', error);
      onError?.(error.message || 'Minting failed');
    } finally {
      setIsMinting(false);
    }
  };

  return (
    <Button
      onClick={handleMint}
      disabled={isMinting || !currentUser?.evmSmartAccounts?.[0]}
      className="w-full lg:w-auto bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
    >
      {isMinting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Minting...
        </>
      ) : (
        'Mint $SYSTEM Tokens'
      )}
    </Button>
  );
};

'use client';

import React, { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, getAddress } from 'viem';
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
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('🪙 MINTING $SYSTEM TOKENS (GASLESS)');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('Smart Wallet Address:', smartAccount);
      console.log('Recipient:', recipientAddress);
      console.log('Amount:', amount, '$SYSTEM');
      console.log('Donation ID:', donationId);
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log('⚠️  IF THIS FAILS: Grant EXECUTIVE_ROLE to Smart Wallet above!');
      console.log('   EXECUTIVE_ROLE = 0xe4eefbff6f5adc6b3fe0d11f14a3859decb3df1f4c82933fc6c1f8b498cc4a7d');
      console.log('   Use Remix to call: grantRole(EXECUTIVE_ROLE, SMART_WALLET_ADDRESS)\n');

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
    <button
      onClick={handleMint}
      disabled={isMinting || !currentUser?.evmSmartAccounts?.[0]}
      style={{
        backgroundColor: (isMinting || !currentUser?.evmSmartAccounts?.[0]) ? '#D8D2C8' : '#3F7A5A',
        color: '#FFFFFF',
        fontWeight: 500,
        padding: '0.75rem 1.5rem',
        borderRadius: '0.75rem',
        width: '100%',
        transition: 'all 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem'
      }}
      className="lg:w-auto"
    >
      {isMinting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Minting...
        </>
      ) : (
        'Mint $SYSTEM'
      )}
    </button>
  );
};

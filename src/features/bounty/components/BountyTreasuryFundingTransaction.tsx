'use client';

import React, { useState, useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { encodeFunctionData, type Abi } from 'viem';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';

const BountyManagerABI = BountyManagerABIJson as Abi;

const BOUNTY_MANAGER_ADDRESS = process.env
  .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

interface BountyTreasuryFundingTransactionProps {
  bountyId: number;
  podId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

/**
 * Transaction component to set treasury as funding source for a bounty
 *
 * This is Step 2 of pod-funded bounty creation:
 * 1. createBounty() - transfers tokens from user wallet to BountyManagerV2
 * 2. setTreasuryFunding() - updates fundingSource to pod treasury address
 *
 * This ensures refunds go to pod treasury, not creator's wallet
 */
export const BountyTreasuryFundingTransaction: React.FC<
  BountyTreasuryFundingTransactionProps
> = ({ bountyId, podId, onSuccess, onError }) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();

  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleSetTreasuryFunding = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for treasury funding:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      onError?.('Smart Wallet not properly configured');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for treasury funding...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - setTreasuryFunding');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'setTreasuryFunding',
        args: [BigInt(bountyId), podId],
      });

      console.log('📝 Encoded call data for setTreasuryFunding');

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: BOUNTY_MANAGER_ADDRESS,
          value: 0n,                     // ← Zero ETH (bigint)
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);
      console.log('✅ Treasury funding set successfully for bounty:', bountyId);

      // Call success handler
      onSuccess?.();
    } catch (err: any) {
      console.error('❌ Treasury funding transaction failed:', err);
      onError?.('Failed to set treasury funding. Please try again.');
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  }, [evmAddress, currentUser, sendUserOperation, bountyId, podId, onSuccess, onError]);

  if (!BOUNTY_MANAGER_ADDRESS) {
    return (
      <div
        className="p-4 rounded-lg"
        style={{
          backgroundColor: '#F5E6E6',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#D9B3B3',
        }}
      >
        <p className="text-sm" style={{ color: '#5C1F1F' }}>
          ⚠️ Bounty Manager contract address not configured.
        </p>
      </div>
    );
  }

  if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
    return (
      <div
        className="p-4 rounded-lg"
        style={{
          backgroundColor: '#FAF4EC',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#E8D7B8',
        }}
      >
        <p className="text-sm" style={{ color: '#8F6B2F' }}>
          Please connect your wallet and ensure Smart Account is configured.
        </p>
        <div className="mt-2 text-xs" style={{ color: '#8F6B2F' }}>
          Address: {evmAddress ? '✓' : '✗'} | Smart Account:{' '}
          {currentUser?.evmSmartAccounts?.[0] ? '✓' : '✗'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: '#E8F1EE',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#B8D9CA',
        }}
      >
        <h4 className="font-semibold mb-2" style={{ color: '#1F453A' }}>
          Step 2: Set Treasury Funding
        </h4>
        <p className="text-sm mb-3" style={{ color: '#2F5D50' }}>
          This transaction will update the funding source to the pod treasury.
          When this bounty is cancelled, refunds will be returned to the pod
          treasury instead of your personal wallet.
        </p>
        <div className="text-xs space-y-1" style={{ color: '#2F5D50' }}>
          <p>
            <strong>Bounty ID:</strong> {bountyId}
          </p>
          <p>
            <strong>Pod ID:</strong> {podId}
          </p>
        </div>
      </div>

      {/* CDP Smart Account Transaction Button */}
      <Button
        onClick={handleSetTreasuryFunding}
        disabled={isTransactionPending}
        className="w-full font-semibold py-3 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors hover:opacity-90"
      >
        {isTransactionPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
            Setting Treasury Funding...
          </>
        ) : (
          'Set Treasury Funding (Gasless)'
        )}
      </Button>
    </div>
  );
};

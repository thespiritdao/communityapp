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
import type { LifecycleStatus } from '@coinbase/onchainkit/transaction';
import BountyManagerABI from '@/abis/BountyManagerV2.json';

const BOUNTY_MANAGER_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

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
export const BountyTreasuryFundingTransaction: React.FC<BountyTreasuryFundingTransactionProps> = ({
  bountyId,
  podId,
  onSuccess,
  onError
}) => {
  const { address } = useAccount();

  const handleTransactionStatus = (status: LifecycleStatus) => {
    console.log('🏦 Treasury funding transaction status:', status);

    if (status.statusName === 'success') {
      console.log('✅ Treasury funding set successfully for bounty:', bountyId);
      onSuccess?.();
    }

    if (status.statusName === 'error') {
      console.error('❌ Treasury funding transaction failed:', status.statusData);
      onError?.('Failed to set treasury funding. Please try again.');
    }
  };

  if (!BOUNTY_MANAGER_ADDRESS) {
    return (
      <div className="p-4 rounded-lg" style={{ backgroundColor: '#F5E6E6', borderWidth: '1px', borderStyle: 'solid', borderColor: '#D9B3B3' }}>
        <p className="text-sm" style={{ color: '#5C1F1F' }}>
          ⚠️ Bounty Manager contract address not configured.
        </p>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="p-4 rounded-lg" style={{ backgroundColor: '#FAF4EC', borderWidth: '1px', borderStyle: 'solid', borderColor: '#E8D7B8' }}>
        <p className="text-sm" style={{ color: '#8F6B2F' }}>
          Please connect your wallet to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg p-4" style={{ backgroundColor: '#E8F1EE', borderWidth: '1px', borderStyle: 'solid', borderColor: '#B8D9CA' }}>
        <h4 className="font-semibold mb-2" style={{ color: '#1F453A' }}>Step 2: Set Treasury Funding</h4>
        <p className="text-sm mb-3" style={{ color: '#2F5D50' }}>
          This transaction will update the funding source to the pod treasury.
          When this bounty is cancelled, refunds will be returned to the pod treasury instead of your personal wallet.
        </p>
        <div className="text-xs space-y-1" style={{ color: '#2F5D50' }}>
          <p><strong>Bounty ID:</strong> {bountyId}</p>
          <p><strong>Pod ID:</strong> {podId}</p>
        </div>
      </div>

      <Transaction
        address={address.toLowerCase() as `0x${string}`}
        chainId={8453}
        calls={[{
          address: BOUNTY_MANAGER_ADDRESS,
          abi: BountyManagerABI,
          functionName: 'setTreasuryFunding',
          args: [BigInt(bountyId), podId]
        }]}
        isSponsored={true}
        onStatus={handleTransactionStatus}
      >
        <TransactionButton
          text="Set Treasury Funding"
          className="w-full font-semibold py-3"
          style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
        />
        <TransactionSponsor />
        <TransactionStatus>
          <TransactionStatusLabel />
          <TransactionStatusAction />
        </TransactionStatus>
      </Transaction>
    </div>
  );
};

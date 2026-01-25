/**
 * BountyCompletion Component
 *
 * UI wrapper for completing a bounty and releasing payment.
 * Uses the new BountyPaymentTransaction component with:
 * - New Transaction API
 * - Deduplication protection
 * - Comprehensive logging
 * - State synchronization
 * - On-chain status checking
 *
 * REFACTORED: Updated from deprecated `contracts` prop to new `calls` prop
 * ENHANCED: Added on-chain status verification and "Already Paid" UI
 *
 * @module BountyCompletion
 */

'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePublicClient } from 'wagmi';
import BountyPaymentTransaction from './BountyPaymentTransaction';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';
import { CheckCircle2 } from 'lucide-react';

const BountyManagerABI = BountyManagerABIJson as any;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface BountyCompletionProps {
  /** On-chain bounty ID */
  onchainBountyId: string;

  /** Database bounty ID */
  bountyId: string;

  /** Database bid ID */
  bidId: string;

  /** Bounty title for display */
  bountyTitle: string;

  /** Bounty value */
  bountyValue: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };

  /** Bidder address (worker who completed the bounty) */
  bidderAddress: string;

  /** Bounty creator address */
  creatorAddress: string;

  /** Callback fired when completion succeeds */
  onComplete?: () => void;

  /** Callback fired when completion fails */
  onError?: (error: Error) => void;

  /** Callback to refresh bounty data after successful payment */
  onRefreshData?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BountyCompletion: React.FC<BountyCompletionProps> = ({
  onchainBountyId,
  bountyId,
  bidId,
  bountyTitle,
  bountyValue,
  bidderAddress,
  creatorAddress,
  onComplete,
  onError,
  onRefreshData,
}) => {
  const publicClient = usePublicClient();
  const [onchainStatus, setOnchainStatus] = useState<number | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);

  // Check on-chain status on mount
  useEffect(() => {
    const checkStatus = async () => {
      if (!publicClient) {
        setIsCheckingStatus(false);
        return;
      }

      try {
        const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
        const [creator, value, token, status] = await publicClient.readContract({
          address: contractAddress,
          abi: BountyManagerABI,
          functionName: 'getBounty',
          args: [BigInt(onchainBountyId)],
        }) as any[];

        console.log('🔍 Bounty on-chain status check:', {
          bountyId: onchainBountyId,
          status,
          statusName: ['Open', 'Assigned', 'Completed', 'Cancelled'][status],
        });

        setOnchainStatus(status);
      } catch (error) {
        console.error('❌ Failed to check on-chain status:', error);
      } finally {
        setIsCheckingStatus(false);
      }
    };

    checkStatus();
  }, [onchainBountyId, publicClient]);

  const handleSuccess = (receipt: any) => {
    console.log('✅ Bounty completed successfully:', receipt.transactionHash);
    setOnchainStatus(2); // Update to completed
    onComplete?.();
  };

  const handleError = (error: Error) => {
    console.error('❌ Failed to complete bounty:', error);
    onError?.(error);
  };

  // Show loading while checking status
  if (isCheckingStatus) {
    return (
      <Card className="w-full max-w-md mx-auto mt-4">
        <CardContent className="pt-6">
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Checking payment status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show "Already Paid" if bounty is completed (status 2)
  if (onchainStatus === 2) {
    return (
      <Card className="w-full max-w-md mx-auto mt-4">
        <CardContent className="pt-6">
          <div className="text-center py-6">
            <CheckCircle2
              className="h-12 w-12 mx-auto mb-4"
              style={{ color: '#3F7A5A' }}
            />
            <h3 className="font-semibold text-lg mb-2" style={{ color: '#2F5D50' }}>
              Payment Already Released
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              This bounty has been completed and paid.
            </p>
            <div className="mt-4 p-3 rounded" style={{ backgroundColor: '#E8F1EE' }}>
              <p className="text-sm">
                <strong>Amount:</strong> {bountyValue.amount} {bountyValue.token}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show payment transaction if bounty is assigned (status 1)
  return (
    <Card className="w-full max-w-md mx-auto mt-4">
      <CardContent>
        <BountyPaymentTransaction
          onchainBountyId={onchainBountyId}
          bountyId={bountyId}
          bidId={bidId}
          paymentAmount={bountyValue.amount}
          paymentToken={bountyValue.token}
          bidderAddress={bidderAddress}
          creatorAddress={creatorAddress}
          bountyTitle={bountyTitle}
          onSuccess={handleSuccess}
          onError={handleError}
          onRefreshData={onRefreshData}
        />
      </CardContent>
    </Card>
  );
};

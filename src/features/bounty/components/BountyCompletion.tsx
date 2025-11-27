/**
 * BountyCompletion Component
 *
 * UI wrapper for completing a bounty and releasing payment.
 * Uses the new BountyPaymentTransaction component with:
 * - New Transaction API
 * - Deduplication protection
 * - Comprehensive logging
 * - State synchronization
 *
 * REFACTORED: Updated from deprecated `contracts` prop to new `calls` prop
 *
 * @module BountyCompletion
 */

"use client"

import type React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BountyPaymentTransaction from './BountyPaymentTransaction';

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
  onRefreshData
}) => {
  const handleSuccess = (receipt: any) => {
    console.log('✅ Bounty completed successfully:', receipt.transactionHash);
    onComplete?.();
  };

  const handleError = (error: Error) => {
    console.error('❌ Failed to complete bounty:', error);
    onError?.(error);
  };

  return (
    <Card className="w-full max-w-md mx-auto">
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
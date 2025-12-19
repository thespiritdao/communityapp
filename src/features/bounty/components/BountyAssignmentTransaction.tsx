/**
 * BountyAssignmentTransaction Component
 *
 * Handles the on-chain assignment of a bounty to a bid winner.
 * This is the SECOND transaction in the approval workflow:
 * 1. First: createBounty (handled by BidReviewManager)
 * 2. Second: assignBounty (THIS COMPONENT)
 *
 * FEATURES:
 * - Uses new Transaction API with `calls` prop
 * - Comprehensive error handling and logging
 * - Database state synchronization with deduplication
 * - Fallback transaction polling
 * - Notification sending
 * - Bid index validation before submission
 *
 * @module BountyAssignmentTransaction
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData, type Abi, type TransactionReceipt } from 'viem';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';

const BountyManagerABI = BountyManagerABIJson as Abi;
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import {
  getTransactionConfig,
  logTransactionLifecycle,
  handleTransactionError,
  pollForTransactionReceipt,
  createTransactionStatusHandler,
  type TransactionCallData,
  BASE_CHAIN_ID,
} from '../utils/transactionUtils';
import {
  syncBidApprovalState,
  type BidApprovalStateUpdate,
} from '../utils/stateSync';
import {
  validateBidForApproval,
  logValidationResult,
  formatValidationError,
} from '../utils/bidIndexValidator';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BountyAssignmentTransactionProps {
  /** On-chain bounty ID (extracted from createBounty logs) */
  onchainBountyId: string;

  /** Index of the bid in the contract's bids array */
  onchainBidIndex: number;

  /** Technical reviewer address */
  reviewer: `0x${string}`;

  /** Final approver address */
  approver: `0x${string}`;

  /** Database bid ID for state synchronization */
  bidId: string;

  /** Database bounty ID for state synchronization */
  bountyId: string;

  /** Address of the bidder (for validation) */
  bidderAddress: string;

  /** Callback fired on successful assignment */
  onSuccess: (receipt: TransactionReceipt) => void;

  /** Callback fired on error */
  onError: (error: Error) => void;

  /** Callback fired when transaction completes (success or error) */
  onComplete?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BountyAssignmentTransaction: React.FC<
  BountyAssignmentTransactionProps
> = ({
  onchainBountyId,
  onchainBidIndex,
  reviewer,
  approver,
  bidId,
  bountyId,
  bidderAddress,
  onSuccess,
  onError,
  onComplete,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();

  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false); // CDP transaction loading state
  const [pollCleanup, setPollCleanup] = useState<(() => void) | null>(null);

  // ============================================================================
  // VALIDATION ON MOUNT
  // ============================================================================

  useEffect(() => {
    const validateBeforeTransaction = async () => {
      if (!publicClient) {
        setValidationError('Wallet not connected');
        setIsValidating(false);
        return;
      }

      console.log('🔍 Validating bid before assignment transaction:', {
        bidId,
        onchainBountyId,
        onchainBidIndex,
        bidderAddress,
      });

      try {
        // Validate bid index and bidder match
        const validation = await validateBidForApproval(
          {
            bidId,
            bidderAddress,
            onchainBountyId,
            onchainBidIndex,
          },
          publicClient,
        );

        logValidationResult(validation);

        if (!validation.isValid) {
          const errorMessage = formatValidationError(validation);
          setValidationError(errorMessage);
          console.error(
            '❌ Bid validation failed - cannot proceed with assignment',
          );
        } else {
          console.log('✅ Bid validation passed - ready for assignment');
        }
      } catch (error) {
        console.error('❌ Error during bid validation:', error);
        setValidationError('Failed to validate bid. Please try again.');
      } finally {
        setIsValidating(false);
      }
    };

    validateBeforeTransaction();
  }, [bidId, onchainBountyId, onchainBidIndex, bidderAddress, publicClient]);

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  useEffect(() => {
    return () => {
      // Cleanup polling on unmount
      if (pollCleanup) {
        pollCleanup();
      }
    };
  }, [pollCleanup]);

  // ============================================================================
  // TRANSACTION HANDLER
  // ============================================================================

  const handleSuccess = async (receipt: TransactionReceipt) => {
    console.log(
      '✅ Assignment transaction successful:',
      receipt.transactionHash,
    );
    setIsProcessing(true);

    try {
      // Step 1: Synchronize database state with on-chain state
      const stateUpdate: BidApprovalStateUpdate = {
        bidId,
        bountyId,
        transactionHash: receipt.transactionHash,
        onchainBountyId,
        onchainBidIndex,
        status: 'approved',
        reviewer,
        approver,
        timestamp: new Date().toISOString(),
      };

      console.log('🔄 Syncing bid approval state to database...');
      const syncResult = await syncBidApprovalState(stateUpdate, publicClient);

      if (!syncResult.success) {
        console.error('❌ Failed to sync approval state:', syncResult.error);
        // Don't throw - transaction was successful, just log the sync failure
      } else if (syncResult.isDuplicate) {
        console.log('⚠️ State already synchronized (duplicate callback)');
      } else {
        console.log('✅ Bid approval state synchronized successfully');
      }

      // Step 2: Send notifications
      console.log('📧 Sending assignment notifications...');

      await Promise.all([
        // Notify bidder
        unifiedNotificationService.createNotification({
          recipient_address: bidderAddress,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Bid Approved & Bounty Assigned!',
          message: `Your bid has been approved and the bounty has been assigned to you. Funds are now in escrow.`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),

        // Notify technical reviewer
        unifiedNotificationService.createNotification({
          recipient_address: reviewer,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Technical Reviewer Assignment',
          message: `You have been assigned as Technical Reviewer for a bounty.`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),

        // Notify final approver
        unifiedNotificationService.createNotification({
          recipient_address: approver,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Final Approver Assignment',
          message: `You have been assigned as Final Approver for a bounty.`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),
      ]);

      console.log('✅ All notifications sent successfully');

      // Step 3: Call parent success handler
      onSuccess(receipt);

      logTransactionLifecycle('Assignment Complete', {
        transactionHash: receipt.transactionHash,
        bountyId: onchainBountyId,
        bidId,
        bidder: bidderAddress,
        reviewer,
        approver,
      });
    } catch (error) {
      console.error('❌ Error in post-assignment processing:', error);
      // Don't call onError - transaction was successful
    } finally {
      setIsProcessing(false);
      onComplete?.();
    }
  };

  const handleError = async (error: Error) => {
    console.error('❌ Assignment transaction failed:', error);
    setIsProcessing(true);

    try {
      if (!evmAddress || !publicClient) {
        onError(error);
        return;
      }

      // Prepare transaction calls for error handler
      const calls: TransactionCallData[] = [
        {
          address: process.env
            .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`,
          abi: BountyManagerABI,
          functionName: 'assignBounty',
          args: [
            BigInt(onchainBountyId),
            BigInt(onchainBidIndex),
            reviewer,
            approver,
          ],
        },
      ];

      // Handle error with comprehensive logging
      await handleTransactionError(
        error,
        'Bounty Assignment',
        calls,
        evmAddress,
        publicClient,
      );

      onError(error);
    } finally {
      setIsProcessing(false);
      onComplete?.();
    }
  };

  // ============================================================================
  // CDP SMART ACCOUNT TRANSACTION HANDLER - EXACT FAUCET PATTERN
  // ============================================================================

  const handleAssignBountyTransaction = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for bounty assignment:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      onError(new Error('Smart Wallet not properly configured'));
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for bounty assignment...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - assignBounty');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'assignBounty',
        args: [
          BigInt(onchainBountyId),
          BigInt(onchainBidIndex),
          reviewer,
          approver,
        ],
      });

      console.log('📝 Encoded call data for assignBounty');

      // EXACT FAUCET PATTERN: Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [{
          to: contractAddress,
          value: 0n,                     // ← Zero ETH (bigint)
          data: callData,
        }],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        await handleSuccess(resultWithReceipt.receipt);
      } else {
        console.warn('⚠️ No receipt found in result');
        onError(new Error('Transaction completed but no receipt found'));
      }
    } catch (err: any) {
      console.error('❌ Bounty assignment failed:', err);
      await handleError(err);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  }, [evmAddress, currentUser, sendUserOperation, onchainBountyId, onchainBidIndex, reviewer, approver, handleSuccess, handleError]);

  // ============================================================================
  // TRANSACTION STATUS HANDLER WITH POLLING FALLBACK (LEGACY - NOT USED)
  // ============================================================================

  const transactionStatusHandler = createTransactionStatusHandler(
    {
      onSuccess: handleSuccess,
      onError: handleError,
    },
    'Bounty Assignment',
  );

  const onStatusWithPolling = async (status: any) => {
    // Call standard status handler
    transactionStatusHandler(status);

    // Start polling as fallback when transaction becomes pending
    if (status.statusName === 'transactionPending' && publicClient) {
      const txHash =
        status.transactionHash || status.statusData?.transactionHash;

      if (txHash) {
        console.log(
          '⏱️ Starting fallback polling for assignment transaction:',
          txHash,
        );

        const cleanup = await pollForTransactionReceipt(
          txHash,
          publicClient,
          (receipt) => {
            console.log(
              '✅ Receipt found via polling:',
              receipt.transactionHash,
            );
            handleSuccess(receipt);
          },
          () => {
            console.log('⏱️ Polling timed out for assignment transaction');
            // Don't call onError - transaction might still succeed
          },
        );

        setPollCleanup(() => cleanup);
      }
    }

    // Cleanup polling on success or error
    if (status.statusName === 'success' || status.statusName === 'error') {
      if (pollCleanup) {
        pollCleanup();
        setPollCleanup(null);
      }
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Show validation in progress
  if (isValidating) {
    return (
      <div className="text-center p-4">
        <p className="text-gray-600">Validating bid before assignment...</p>
      </div>
    );
  }

  // Show validation error
  if (validationError) {
    return (
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: '#F5E6E6',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#D9B3B3',
        }}
      >
        <h4 className="font-semibold mb-2" style={{ color: '#5C1F1F' }}>
          Cannot Assign Bounty
        </h4>
        <p className="text-sm whitespace-pre-wrap" style={{ color: '#8B3A3A' }}>
          {validationError}
        </p>
        <button
          onClick={() => onError(new Error(validationError))}
          className="mt-4 px-4 py-2 rounded"
          style={{ backgroundColor: '#F5E6E6', color: '#5C1F1F' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#D9B3B3';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#F5E6E6';
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  // Render transaction component
  const contractAddress = process.env
    .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

  return (
    <div className="space-y-4">
      {/* Assignment Details */}
      <div
        className="p-4 rounded-lg space-y-3 text-sm"
        style={{ backgroundColor: '#E8F1EE' }}
      >
        <div>
          <p className="font-semibold text-gray-700 mb-1">Bounty ID:</p>
          <p className="text-gray-900">{onchainBountyId}</p>
        </div>

        <div>
          <p className="font-semibold text-gray-700 mb-1">Bid Index:</p>
          <p className="text-gray-900">{onchainBidIndex}</p>
        </div>

        <div>
          <p className="font-semibold text-gray-700 mb-2">Bidder:</p>
          <UserProfileDisplay
            walletAddress={bidderAddress}
            size="md"
            showModal={true}
          />
        </div>

        <div>
          <p className="font-semibold text-gray-700 mb-2">Reviewer:</p>
          <UserProfileDisplay
            walletAddress={reviewer}
            size="md"
            showModal={true}
          />
        </div>

        <div>
          <p className="font-semibold text-gray-700 mb-2">Approver:</p>
          <UserProfileDisplay
            walletAddress={approver}
            size="md"
            showModal={true}
          />
        </div>
      </div>

      {/* CDP Smart Account Transaction Button */}
      <Button
        onClick={handleAssignBountyTransaction}
        disabled={isTransactionPending || isProcessing || !currentUser?.evmSmartAccounts?.[0]}
        className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors hover:opacity-90"
      >
        {isTransactionPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
            Assigning Bounty...
          </>
        ) : isProcessing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
            Processing...
          </>
        ) : (
          'Assign Bounty & Setup Escrow (Gasless)'
        )}
      </Button>

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="text-center text-sm text-gray-600">
          Processing assignment and sending notifications...
        </div>
      )}
    </div>
  );
};

export default BountyAssignmentTransaction;

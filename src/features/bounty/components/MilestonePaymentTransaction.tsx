/**
 * MilestonePaymentTransaction Component
 *
 * Handles payment transactions for individual milestones.
 * Uses releaseMilestonePayment function for targeted milestone payments.
 *
 * FEATURES:
 * - Individual milestone payment processing
 * - Milestone status tracking
 * - Database state synchronization
 * - Comprehensive error handling
 *
 * @module MilestonePaymentTransaction
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData, type Abi, type TransactionReceipt } from 'viem';
import { parseEther } from 'viem';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BountyManagerV5Artifact from '@/abis/BountyManagerV5.json';

const BountyManagerABI = BountyManagerV5Artifact.abi as Abi;
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import {
  logTransactionLifecycle,
  handleTransactionError,
  pollForTransactionReceipt,
  createTransactionStatusHandler,
  type TransactionCallData,
  BASE_CHAIN_ID,
} from '../utils/transactionUtils';
import {
  syncMilestonePaymentState,
  type MilestonePaymentStateUpdate,
} from '../utils/stateSync';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface MilestonePaymentTransactionProps {
  /** On-chain bounty ID */
  onchainBountyId: string;

  /** Database bounty ID for state synchronization */
  bountyId: string;

  /** Database milestone ID */
  milestoneId: string;

  /** On-chain milestone index */
  onchainMilestoneId: string;

  /** Payment amount for this milestone */
  paymentAmount: string;

  /** Payment token type */
  paymentToken: 'SYSTEM' | 'SELF';

  /** Worker address receiving payment */
  workerAddress: string;

  /** Bounty creator address */
  creatorAddress: string;

  /** Bounty title for notifications */
  bountyTitle: string;

  /** Milestone description */
  milestoneDescription: string;

  /** Callback fired on successful payment */
  onSuccess: (receipt: TransactionReceipt) => void;

  /** Callback fired on error */
  onError: (error: Error) => void;

  /** Callback fired when transaction completes */
  onComplete?: () => void;

  /** Callback to refresh milestone data */
  onRefreshData?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const MilestonePaymentTransaction: React.FC<
  MilestonePaymentTransactionProps
> = ({
  onchainBountyId,
  bountyId,
  milestoneId,
  onchainMilestoneId,
  paymentAmount,
  paymentToken,
  workerAddress,
  creatorAddress,
  bountyTitle,
  milestoneDescription,
  onSuccess,
  onError,
  onComplete,
  onRefreshData,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [pollCleanup, setPollCleanup] = useState<(() => void) | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

  // ============================================================================
  // CLEANUP ON UNMOUNT
  // ============================================================================

  useEffect(() => {
    return () => {
      if (pollCleanup) {
        pollCleanup();
      }
    };
  }, [pollCleanup]);

  // ============================================================================
  // TRANSACTION HANDLER
  // ============================================================================

  const handleSuccess = async (receipt: TransactionReceipt) => {
    // Prevent duplicate processing
    if (isCompleted || isProcessing) {
      console.log(
        '⚠️ Milestone payment already processed, skipping duplicate callback',
      );
      return;
    }

    console.log(
      '✅ Milestone payment transaction successful:',
      receipt.transactionHash,
    );
    setIsProcessing(true);
    setIsCompleted(true);

    try {
      // Step 1: Synchronize milestone state with database
      const stateUpdate: MilestonePaymentStateUpdate = {
        milestoneId,
        bountyId,
        transactionHash: receipt.transactionHash,
        paymentAmount,
        paymentToken,
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      console.log('🔄 Syncing milestone payment state to database...');
      const syncResult = await syncMilestonePaymentState(
        stateUpdate,
        publicClient,
      );

      if (!syncResult.success) {
        console.error(
          '❌ Failed to sync milestone payment state:',
          syncResult.error,
        );
      } else if (syncResult.isDuplicate) {
        console.log(
          '⚠️ Milestone state already synchronized (duplicate callback)',
        );
      } else {
        console.log('✅ Milestone payment state synchronized successfully');
      }

      // Step 2: Send notifications
      console.log('📧 Sending milestone payment completion notifications...');

      await Promise.all([
        // Notify worker
        unifiedNotificationService.createNotification({
          recipient_address: workerAddress,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Milestone Payment Released!',
          message: `Payment of ${paymentAmount} ${paymentToken} has been released for milestone "${milestoneDescription}" in bounty "${bountyTitle}".`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),

        // Notify creator
        unifiedNotificationService.createNotification({
          recipient_address: creatorAddress,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Milestone Payment Released',
          message: `Milestone "${milestoneDescription}" has been completed and payment released for bounty "${bountyTitle}".`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),
      ]);

      console.log('✅ All milestone notifications sent successfully');

      // Step 3: Refresh data to update UI
      if (onRefreshData) {
        console.log('🔄 Refreshing milestone data after payment...');
        onRefreshData();
      }

      // Step 4: Call parent success handler
      onSuccess(receipt);

      logTransactionLifecycle('Milestone Payment Complete', {
        transactionHash: receipt.transactionHash,
        bountyId: onchainBountyId,
        milestoneId: onchainMilestoneId,
        worker: workerAddress,
        paymentAmount,
        paymentToken,
        milestoneDescription,
      });
    } catch (error) {
      console.error('❌ Error in post-milestone-payment processing:', error);
    } finally {
      setIsProcessing(false);
      onComplete?.();
    }
  };

  const handleError = async (error: Error) => {
    console.error('❌ Milestone payment transaction failed:', error);
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
          // V5 removed per-milestone on-chain accounting; partial releases go
          // through releasePayment(bountyId, amount). Which milestone this pays
          // is tracked in the database (syncMilestonePaymentState).
          functionName: 'releasePayment',
          args: [BigInt(onchainBountyId), parseEther(paymentAmount)],
        },
      ];

      // Handle error with comprehensive logging
      await handleTransactionError(
        error,
        'Milestone Payment',
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

  const handleReleaseMilestonePaymentTransaction = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for milestone payment:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      onError(new Error('Smart Wallet not properly configured'));
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for milestone payment...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - releasePayment (milestone portion)');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      // V5 removed per-milestone on-chain accounting; partial releases go
      // through releasePayment(bountyId, amount). Which milestone this pays
      // is tracked in the database (syncMilestonePaymentState).
      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'releasePayment',
        args: [BigInt(onchainBountyId), parseEther(paymentAmount)],
      });

      console.log('📝 Encoded call data for releasePayment');

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
      console.error('❌ Milestone payment failed:', err);
      await handleError(err);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  }, [evmAddress, currentUser, sendUserOperation, onchainBountyId, onchainMilestoneId, paymentAmount, handleSuccess, handleError]);

  // ============================================================================
  // RENDER
  // ============================================================================

  const contractAddress = process.env
    .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

  return (
    <div className="space-y-4">
      {/* Milestone Payment Details */}
      <div
        className="p-4 rounded-lg space-y-3 text-sm"
        style={{ backgroundColor: '#D1E6DC' }}
      >
        <p>
          <strong>Milestone:</strong> {milestoneDescription}
        </p>
        <p>
          <strong>Bounty:</strong> {bountyTitle}
        </p>
        <p>
          <strong>Amount:</strong> {paymentAmount} {paymentToken}
        </p>
        <div className="flex items-center gap-2">
          <strong>Worker:</strong>
          <UserProfileDisplay
            walletAddress={workerAddress}
            size="md"
            showModal={true}
          />
        </div>
      </div>

      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: '#FAF4EC',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: '#E8D7B8',
        }}
      >
        <p className="text-sm" style={{ color: '#8F6B2F' }}>
          <strong>⚠️ Important:</strong> This will release payment for this
          specific milestone only. Other milestones require separate approval
          and payment.
        </p>
      </div>

      {/* CDP Smart Account Transaction Button */}
      {!contractAddress ? (
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: '#F5E6E6',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#D9B3B3',
          }}
        >
          <p className="text-sm" style={{ color: '#5C1F1F' }}>
            <strong>Configuration Error:</strong> Missing contract address.
            Please set NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS in your environment
            variables.
          </p>
        </div>
      ) : evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <Button
          onClick={handleReleaseMilestonePaymentTransaction}
          disabled={isTransactionPending || isProcessing}
          className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold py-3 transition-colors hover:opacity-90"
        >
          {isTransactionPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              Releasing Payment...
            </>
          ) : isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
              Processing...
            </>
          ) : (
            'Release Milestone Payment (Gasless)'
          )}
        </Button>
      ) : (
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: '#F5E6E6',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: '#D9B3B3',
          }}
        >
          <p className="text-sm" style={{ color: '#5C1F1F' }}>
            <strong>Configuration Error:</strong> Missing wallet connection or
            Smart Account. Please check your connection.
          </p>
          <div className="mt-2 text-xs" style={{ color: '#8B3A3A' }}>
            Address: {evmAddress ? '✓' : '✗'} | Smart Account:{' '}
            {currentUser?.evmSmartAccounts?.[0] ? '✓' : '✗'}
          </div>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="text-center text-sm text-gray-600">
          Processing milestone payment and sending notifications...
        </div>
      )}
    </div>
  );
};

export default MilestonePaymentTransaction;

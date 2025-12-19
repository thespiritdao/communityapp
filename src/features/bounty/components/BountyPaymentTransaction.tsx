/**
 * BountyPaymentTransaction Component
 *
 * Handles the final payment transaction for bounty completion.
 * This is called when a reviewer approves the work and releases escrow funds.
 *
 * FEATURES:
 * - Uses new Transaction API with `calls` prop
 * - Comprehensive error handling and logging
 * - Database state synchronization with deduplication
 * - Fallback transaction polling
 * - Notification sending
 * - Payment state verification
 *
 * @module BountyPaymentTransaction
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData, parseEther, type Abi, type TransactionReceipt } from 'viem';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';

const BountyManagerABI = BountyManagerABIJson as Abi;
import { UserProfileDisplay } from '@/components/UserProfileDisplay';
import {
  logTransactionLifecycle,
  handleTransactionError,
  pollForTransactionReceipt,
  createTransactionStatusHandler,
  type TransactionCallData,
  BASE_CHAIN_ID,
} from '../utils/transactionUtils';
import { syncPaymentState, type PaymentStateUpdate } from '../utils/stateSync';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BountyPaymentTransactionProps {
  /** On-chain bounty ID */
  onchainBountyId: string;

  /** Database bounty ID for state synchronization */
  bountyId: string;

  /** Database bid ID for state synchronization */
  bidId: string;

  /** Payment amount (for logging and verification) */
  paymentAmount: string;

  /** Payment token type */
  paymentToken: 'SYSTEM' | 'SELF';

  /** Bidder address (for notifications) */
  bidderAddress: string;

  /** Bounty creator address (for notifications) */
  creatorAddress: string;

  /** Bounty title (for notifications) */
  bountyTitle: string;

  /** Callback fired on successful payment */
  onSuccess: (receipt: TransactionReceipt) => void;

  /** Callback fired on error */
  onError: (error: Error) => void;

  /** Callback fired when transaction completes (success or error) */
  onComplete?: () => void;

  /** Callback to refresh bounty data after successful payment */
  onRefreshData?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const BountyPaymentTransaction: React.FC<
  BountyPaymentTransactionProps
> = ({
  onchainBountyId,
  bountyId,
  bidId,
  paymentAmount,
  paymentToken,
  bidderAddress,
  creatorAddress,
  bountyTitle,
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
  const [isTransactionPending, setIsTransactionPending] = useState(false); // CDP transaction loading state
  const [pollCleanup, setPollCleanup] = useState<(() => void) | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);

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
    // Prevent duplicate processing
    if (isCompleted || isProcessing) {
      console.log('⚠️ Payment already processed, skipping duplicate callback');
      return;
    }

    console.log('✅ Payment transaction successful:', receipt.transactionHash);
    setIsProcessing(true);
    setIsCompleted(true);

    try {
      // Step 1: Synchronize database state with on-chain state
      const stateUpdate: PaymentStateUpdate = {
        bidId,
        bountyId,
        transactionHash: receipt.transactionHash,
        paymentAmount,
        paymentToken,
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      console.log('🔄 Syncing payment state to database...');
      const syncResult = await syncPaymentState(stateUpdate, publicClient);

      if (!syncResult.success) {
        console.error('❌ Failed to sync payment state:', syncResult.error);
        // Don't throw - transaction was successful, just log the sync failure
      } else if (syncResult.isDuplicate) {
        console.log('⚠️ State already synchronized (duplicate callback)');
      } else {
        console.log('✅ Payment state synchronized successfully');
      }

      // Step 2: Send notifications
      console.log('📧 Sending payment completion notifications...');

      await Promise.all([
        // Notify bidder (worker who completed the bounty)
        unifiedNotificationService.createNotification({
          recipient_address: bidderAddress,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Bounty Payment Released!',
          message: `Payment of ${paymentAmount} ${paymentToken} has been released for "${bountyTitle}". The bounty is now complete.`,
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
          title: 'Bounty Completed',
          message: `Bounty "${bountyTitle}" has been completed and payment released.`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),
      ]);

      console.log('✅ All notifications sent successfully');

      // Step 3: Refresh data to update UI
      if (onRefreshData) {
        console.log('🔄 Refreshing bounty data after payment...');
        onRefreshData();
      }

      // Step 4: Call parent success handler
      onSuccess(receipt);

      logTransactionLifecycle('Payment Complete', {
        transactionHash: receipt.transactionHash,
        bountyId: onchainBountyId,
        bidId,
        bidder: bidderAddress,
        paymentAmount,
        paymentToken,
      });
    } catch (error) {
      console.error('❌ Error in post-payment processing:', error);
      // Don't call onError - transaction was successful
    } finally {
      setIsProcessing(false);
      onComplete?.();
    }
  };

  const handleError = async (error: Error) => {
    console.error('❌ Payment transaction failed:', error);
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
          functionName: 'releasePayment',
          args: [BigInt(onchainBountyId), parseEther(paymentAmount)],
        },
      ];

      // Handle error with comprehensive logging
      await handleTransactionError(
        error,
        'Bounty Payment',
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

  const handleReleasePaymentTransaction = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for payment release:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      onError(new Error('Smart Wallet not properly configured'));
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for payment release...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - releasePayment');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      // EXACT FAUCET PATTERN: Encode call data
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
      console.error('❌ Payment release failed:', err);
      await handleError(err);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  }, [evmAddress, currentUser, sendUserOperation, onchainBountyId, paymentAmount, handleSuccess, handleError]);

  // ============================================================================
  // TRANSACTION STATUS HANDLER WITH POLLING FALLBACK (LEGACY - NOT USED)
  // ============================================================================

  const transactionStatusHandler = createTransactionStatusHandler(
    {
      onSuccess: handleSuccess,
      onError: handleError,
    },
    'Bounty Payment',
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
          '⏱️ Starting fallback polling for payment transaction:',
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
            console.log('⏱️ Polling timed out for payment transaction');
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

  const contractAddress = process.env
    .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

  return (
    <div className="space-y-4">
      {/* Payment Details */}
      <div
        className="p-4 rounded-lg space-y-3 text-sm"
        style={{ backgroundColor: '#E8F1EE' }}
      >
        <p>
          <strong>Bounty:</strong> {bountyTitle}
        </p>
        <p>
          <strong>Amount:</strong> {paymentAmount} {paymentToken}
        </p>
        <div className="flex items-center gap-2">
          <strong>Recipient:</strong>
          <UserProfileDisplay
            walletAddress={bidderAddress}
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
          <strong>⚠️ Important:</strong> This will release payment from escrow to
          the bounty worker. This action cannot be undone.
        </p>
      </div>

      {/* CDP Smart Account Transaction Button */}
      {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
        <Button
          onClick={handleReleasePaymentTransaction}
          disabled={isTransactionPending || isProcessing}
          className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors hover:opacity-90"
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
            'Release Payment (Gasless)'
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
          Processing payment and sending notifications...
        </div>
      )}
    </div>
  );
};

export default BountyPaymentTransaction;

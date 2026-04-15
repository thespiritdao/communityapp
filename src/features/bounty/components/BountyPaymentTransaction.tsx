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
import { useEvmAddress, useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData, parseEther, type Abi, type TransactionReceipt } from 'viem';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
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
  const { toast } = useToast();

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

        // Show success message to user
        toast({
          title: 'Payment Released Successfully!',
          description: `${paymentAmount} ${paymentToken} has been released for "${bountyTitle}". The bounty is now complete.`,
          variant: 'default',
        });
      }

      // Step 2: Send notifications
      console.log('📧 Sending payment completion notifications...');

      const notificationPromises = [
        // Notify bidder (worker who completed the bounty)
        unifiedNotificationService.createNotification({
          recipient_address: bidderAddress,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Payment Released!',
          message: `Payment of ${paymentAmount} ${paymentToken} has been released for "${bountyTitle}". The bounty is complete. 🎉`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'urgent',
        }),

        // Notify creator
        unifiedNotificationService.createNotification({
          recipient_address: creatorAddress,
          sender_address: evmAddress!,
          notification_type: 'bounty_update',
          title: 'Bounty Completed',
          message: `Bounty "${bountyTitle}" has been completed and payment of ${paymentAmount} ${paymentToken} has been released.`,
          context_type: 'bounty',
          context_id: bountyId,
          context_url: `/bounty/${bountyId}`,
          priority: 'high',
        }),
      ];

      // Notify technical reviewer and final approver if they exist
      try {
        const { data: bidData } = await (await import('@/lib/supabase')).supabase
          .from('bids')
          .select('reviewer_address, final_approver_address')
          .eq('id', bidId)
          .single();

        if (bidData?.reviewer_address && bidData.reviewer_address !== creatorAddress) {
          notificationPromises.push(
            unifiedNotificationService.createNotification({
              recipient_address: bidData.reviewer_address,
              sender_address: evmAddress!,
              notification_type: 'bounty_update',
              title: 'Bounty Completed',
              message: `A bounty you reviewed ("${bountyTitle}") has been completed and payment released.`,
              context_type: 'bounty',
              context_id: bountyId,
              context_url: `/bounty/${bountyId}`,
              priority: 'medium',
            })
          );
        }

        if (bidData?.final_approver_address && bidData.final_approver_address !== creatorAddress && bidData.final_approver_address !== bidData.reviewer_address) {
          notificationPromises.push(
            unifiedNotificationService.createNotification({
              recipient_address: bidData.final_approver_address,
              sender_address: evmAddress!,
              notification_type: 'bounty_update',
              title: 'Bounty Completed',
              message: `A bounty you approved ("${bountyTitle}") has been completed and payment released.`,
              context_type: 'bounty',
              context_id: bountyId,
              context_url: `/bounty/${bountyId}`,
              priority: 'medium',
            })
          );
        }
      } catch (reviewerError) {
        console.error('⚠️ Failed to fetch reviewer addresses:', reviewerError);
        // Don't block payment completion
      }

      // Notify pod members if this is a pod bounty
      try {
        const { data: bountyData } = await (await import('@/lib/supabase')).supabase
          .from('bounties')
          .select('pod_id')
          .eq('id', bountyId)
          .single();

        if (bountyData?.pod_id) {
          const { data: podData } = await (await import('@/lib/supabase')).supabase
            .from('pods')
            .select('pod_members, pod_leads')
            .eq('id', bountyData.pod_id)
            .single();

          if (podData) {
            const allMembers = [
              ...(podData.pod_members || []),
              ...(podData.pod_leads || []),
            ];

            // Notify pod members (excluding creator, bidder, and reviewers)
            const excludeAddresses = new Set([
              creatorAddress.toLowerCase(),
              bidderAddress.toLowerCase(),
              evmAddress?.toLowerCase(),
            ]);

            for (const member of allMembers) {
              if (!excludeAddresses.has(member.toLowerCase())) {
                notificationPromises.push(
                  unifiedNotificationService.createNotification({
                    recipient_address: member,
                    sender_address: evmAddress!,
                    notification_type: 'bounty_update',
                    title: 'Pod Bounty Completed',
                    message: `A bounty in your pod ("${bountyTitle}") has been completed.`,
                    context_type: 'bounty',
                    context_id: bountyId,
                    context_url: `/bounty/${bountyId}`,
                    priority: 'low',
                  })
                );
              }
            }
          }
        }
      } catch (podError) {
        console.error('⚠️ Failed to notify pod members:', podError);
        // Don't block payment completion
      }

      await Promise.all(notificationPromises);

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

      // Show error message to user
      toast({
        title: 'Payment Release Failed',
        description: error.message || 'Failed to release payment. Please try again.',
        variant: 'destructive',
      });

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
      // PRE-FLIGHT CHECK: Verify bounty is assigned before attempting payment
      console.log('🔍 Pre-flight check: Verifying bounty status...');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      if (!publicClient) {
        onError(new Error('Public client not available'));
        return;
      }

      // getBounty returns: [creator, value, token, status]
      const bountyData = await publicClient.readContract({
        address: contractAddress,
        abi: BountyManagerABI,
        functionName: 'getBounty',
        args: [BigInt(onchainBountyId)],
      });

      // CRITICAL FIX: getBounty returns an array, not an object
      // Status is at index [3], not .status property
      const [creator, value, token, status] = bountyData as any[];

      const statusNames = ['Open', 'Assigned', 'Completed', 'Cancelled'];
      const statusName = statusNames[status as number] || 'Unknown';

      console.log('📊 Bounty status:', {
        status,
        statusName,
        creator,
        value: value?.toString(),
        token,
      });

      // Check status
      if (status === 2) {
        // Bounty already completed
        onError(new Error(`Bounty has already been completed and paid. No further payment needed.`));
        return;
      }

      if (status !== 1) {
        // Bounty not assigned (status 0 = Open, 3 = Cancelled)
        onError(new Error(`Bounty must be assigned before releasing payment. Current status: ${statusName}. Please wait for the assignment transaction to complete.`));
        return;
      }

      console.log('✅ Pre-flight check passed: Bounty is assigned');
      console.log('🚀 Building Smart Account User Operation for payment release...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - releasePayment');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data
      // FIX: Contract expects uint128, not uint256. Convert amount properly.
      // Use parseEther to convert decimal string to wei (BigInt)
      const amountWei = parseEther(paymentAmount);

      // Validate amount fits in uint128
      const MAX_UINT128 = BigInt(2 ** 128 - 1);
      if (amountWei > MAX_UINT128) {
        onError(new Error(`Amount ${paymentAmount} exceeds uint128 maximum`));
        return;
      }

      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'releasePayment',
        args: [BigInt(onchainBountyId), amountWei],
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

      // CDP Smart Account returns userOperationHash, not receipt immediately
      // CRITICAL FIX: Don't call handleSuccess immediately - verify on-chain first
      const resultWithHash = result as any;
      const userOpHash = resultWithHash?.userOperationHash || resultWithHash?.hash;

      if (!userOpHash) {
        console.warn('⚠️ No hash found in result');
        onError(new Error('Transaction sent but no confirmation hash received'));
        return;
      }

      console.log('📝 UserOperation hash:', userOpHash);
      console.log('⏳ Starting verification loop (CDP Smart Account transactions take 2-3 minutes)...');

      // Show processing message to user
      toast({
        title: 'Payment Transaction Submitted',
        description: 'Verifying payment on-chain. This may take 2-3 minutes...',
        variant: 'default',
      });

      // VERIFICATION LOOP: Wait for on-chain confirmation (same pattern as BountyAssignmentTransaction)
      const verifyPayment = async (retryCount = 0): Promise<void> => {
        const maxRetries = 12; // 2 minutes total (10 second intervals)

        try {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds before first check

          console.log(`🔍 Payment verification attempt ${retryCount + 1}/${maxRetries}...`);

          if (!publicClient) {
            throw new Error('Public client not available');
          }

          // Check if payment was released by reading the assignment state
          const assignmentData = await publicClient.readContract({
            address: contractAddress,
            abi: BountyManagerABI,
            functionName: 'getAssignment',
            args: [BigInt(onchainBountyId)],
          }) as any;

          // getAssignment returns: (bidder, reviewer, escrowAmount, paidAmount)
          const paidAmount = assignmentData[3];
          // Convert decimal string to wei using parseEther (e.g., "0.0009" -> BigInt wei)
          const expectedPaidWei = parseEther(paymentAmount);

          console.log('💰 Payment status:', {
            paidAmount: paidAmount?.toString() || '0',
            expectedAmount: expectedPaidWei.toString(),
            isPaid: paidAmount >= expectedPaidWei,
          });

          if (paidAmount >= expectedPaidWei) {
            console.log('✅ Payment verified on-chain!');

            // Create a mock receipt for the success handler
            const mockReceipt = {
              transactionHash: userOpHash as `0x${string}`,
              blockNumber: BigInt(0),
              blockHash: '0x' as `0x${string}`,
              transactionIndex: 0,
              from: evmAddress! as `0x${string}`,
              to: contractAddress,
              cumulativeGasUsed: BigInt(0),
              gasUsed: BigInt(0),
              logs: [],
              logsBloom: '0x' as `0x${string}`,
              status: 'success' as const,
              effectiveGasPrice: BigInt(0),
              type: 'eip1559' as const,
            };

            await handleSuccess(mockReceipt);
            return;
          }

          // Not paid yet, retry if we haven't exceeded max retries
          if (retryCount < maxRetries - 1) {
            console.log('⏳ Payment not confirmed yet, will retry...');
            await verifyPayment(retryCount + 1);
          } else {
            console.error('❌ Payment verification timeout');

            // Show timeout warning to user
            toast({
              title: 'Payment Verification Timeout',
              description: 'Transaction submitted but could not be verified yet. The transaction may still be processing. Please refresh the page in a few minutes to check the status.',
              variant: 'destructive',
            });

            onError(
              new Error(
                'Transaction submitted but payment could not be verified. The transaction may still be processing. Please refresh the page in a few minutes to check the status.',
              ),
            );
          }
        } catch (error) {
          console.error('❌ Error verifying payment:', error);
          if (retryCount < maxRetries - 1) {
            console.log('⏳ Retrying verification...');
            await verifyPayment(retryCount + 1);
          } else {
            onError(error as Error);
          }
        }
      };

      // Start verification
      verifyPayment();
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
        <div>
          <p className="mb-2"><strong>Recipient:</strong></p>
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
          className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors"
          style={{
            backgroundColor: isTransactionPending || isProcessing ? undefined : '#2F5D50',
            color: '#FFFFFF'
          }}
          onMouseEnter={(e) => {
            if (!isTransactionPending && !isProcessing) {
              e.currentTarget.style.backgroundColor = '#254A40';
            }
          }}
          onMouseLeave={(e) => {
            if (!isTransactionPending && !isProcessing) {
              e.currentTarget.style.backgroundColor = '#2F5D50';
            }
          }}
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
            'Release Payment'
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

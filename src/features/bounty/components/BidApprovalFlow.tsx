/**
 * BidApprovalFlow Component
 *
 * Orchestrates the complete bid approval workflow with support for both
 * draft bounties (created during approval) and existing bounties (already on-chain).
 *
 * WORKFLOW FOR EXISTING BOUNTIES (bounty.onchain_id exists):
 * 1. Show approval dialog with bid details
 * 2. Validate bid has onchainBidIndex
 * 3. Assign bounty to winning bidder (skip creation)
 * 4. Synchronize database state
 * 5. Send notifications
 *
 * WORKFLOW FOR DRAFT BOUNTIES (bounty.onchain_id is null):
 * 1. Show approval dialog with bid details
 * 2. Create bounty on-chain (with token approval)
 * 3. Extract bounty ID from transaction logs
 * 4. Assign bounty to winning bidder
 * 5. Synchronize database state
 * 6. Send notifications
 *
 * This component automatically detects which flow to use based on the presence
 * of bounty.onchain_id. Most bounties in the current implementation are created
 * immediately, so the existing bounty flow will be used most often.
 *
 * CRITICAL FIXES APPLIED:
 * - Check for existing onchain_id before creating bounty (prevents duplicates)
 * - Use correct field name: bid.onchainBidIndex (not bid.onchain_bid_index)
 * - Strict validation with no fallback (prevents wrong bidder assignment)
 *
 * @module BidApprovalFlow
 */

'use client';

import React, { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import type { TransactionReceipt } from 'viem';
import BountyManagerABI from '@/abis/BountyManagerV2.json';
import BidApprovalDialog from './BidApprovalDialog';
import BountyAssignmentTransaction from './BountyAssignmentTransaction';
import type { FrontendBid } from '../types/bounty';
import {
  logTransactionLifecycle,
  handleTransactionError,
  validateTransactionData,
  createTransactionStatusHandler,
  BASE_CHAIN_ID,
  type TransactionCallData,
} from '../utils/transactionUtils';
import { supabase } from '@/lib/supabase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BidApprovalFlowProps {
  /** Bid being approved */
  bid: FrontendBid;

  /** Bounty data (for transaction construction) */
  bounty: {
    id: string;
    title: string;
    podId: string;
    onchain_id?: number; // Existing on-chain bounty ID (if already created)
    value: {
      amount: string;
      token: 'SYSTEM' | 'SELF';
    };
  };

  /** Token symbol for display */
  tokenSymbol: string;

  /** Whether dialog is open */
  open: boolean;

  /** Callback to close dialog */
  onClose: () => void;

  /** Callback when entire approval flow completes successfully */
  onApprovalComplete: () => void;

  /** Callback when approval flow fails */
  onApprovalError: (error: Error) => void;
}

interface PendingAssignment {
  onchainBountyId: string;
  onchainBidIndex: number;
  reviewer: `0x${string}`;
  approver: `0x${string}`;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extracts bounty ID from transaction receipt logs
 * Event: BountyCreated(uint256 indexed id, address indexed creator, string podId, string ipfsHash)
 */
const extractBountyIdFromLogs = (
  logs: any[],
  bountyManagerAddress: string,
): string | null => {
  try {
    // Look for BountyCreated event from BountyManager contract
    const bountyCreatedLog = logs?.find(
      (log: any) =>
        log.topics &&
        log.topics.length >= 2 &&
        log.address?.toLowerCase() === bountyManagerAddress.toLowerCase(),
    );

    if (bountyCreatedLog && bountyCreatedLog.topics?.[1]) {
      const bountyIdHex = bountyCreatedLog.topics[1];
      const bountyId = BigInt(bountyIdHex).toString();
      console.log('✅ Extracted bounty ID from logs:', bountyId);
      return bountyId;
    }

    console.warn('⚠️ Could not find BountyCreated event in logs');
    return null;
  } catch (error) {
    console.error('❌ Error extracting bounty ID from logs:', error);
    return null;
  }
};

/**
 * Converts payment option string to contract payment type enum
 */
const getPaymentType = (paymentOption: string): number => {
  switch (paymentOption) {
    case 'milestones':
      return 1; // MILESTONE
    case 'split':
      return 2; // SPLIT
    default:
      return 0; // COMPLETION
  }
};

/**
 * Checks if bounty can accept more bids based on bid limit configuration
 */
const canAcceptMoreBids = async (
  bountyId: string,
): Promise<{ canAccept: boolean; reason?: string }> => {
  try {
    console.log('🔍 Checking if bounty can accept more bids:', bountyId);

    // Fetch bounty configuration
    const { data: bounty, error } = await supabase
      .from('bounties')
      .select(
        'bid_acceptance_mode, max_bids_accepted, bids_accepted_count, deadline',
      )
      .eq('id', bountyId)
      .single();

    if (error || !bounty) {
      console.error('❌ Error fetching bounty:', error);
      return { canAccept: false, reason: 'Bounty not found' };
    }

    console.log('📋 Bounty bid limit config:', {
      mode: bounty.bid_acceptance_mode,
      maxBids: bounty.max_bids_accepted,
      acceptedCount: bounty.bids_accepted_count,
    });

    // Check by mode
    switch (bounty.bid_acceptance_mode) {
      case 'single':
        if ((bounty.bids_accepted_count || 0) >= 1) {
          return {
            canAccept: false,
            reason: 'This bounty only accepts 1 bid (already accepted)',
          };
        }
        break;

      case 'multiple':
        const maxBids = bounty.max_bids_accepted || 1;
        const acceptedCount = bounty.bids_accepted_count || 0;
        if (acceptedCount >= maxBids) {
          return {
            canAccept: false,
            reason: `Maximum of ${maxBids} bid${maxBids > 1 ? 's' : ''} already accepted`,
          };
        }
        break;

      case 'date_limited':
        if (bounty.deadline) {
          const now = Math.floor(Date.now() / 1000);
          const deadline =
            typeof bounty.deadline === 'string'
              ? Math.floor(new Date(bounty.deadline).getTime() / 1000)
              : bounty.deadline;

          if (now > deadline) {
            return {
              canAccept: false,
              reason: 'Deadline has passed - no more bids can be accepted',
            };
          }
        }
        break;

      case 'unlimited':
        // Always allow
        break;

      default:
        // Default to single mode if not set
        if ((bounty.bids_accepted_count || 0) >= 1) {
          return {
            canAccept: false,
            reason: 'This bounty only accepts 1 bid (already accepted)',
          };
        }
    }

    console.log('✅ Bounty can accept more bids');
    return { canAccept: true };
  } catch (error) {
    console.error('❌ Error checking bid limits:', error);
    return {
      canAccept: false,
      reason: 'Failed to check bid limits',
    };
  }
};

// ============================================================================
// COMPONENT
// ============================================================================

export const BidApprovalFlow: React.FC<BidApprovalFlowProps> = ({
  bid,
  bounty,
  tokenSymbol,
  open,
  onClose,
  onApprovalComplete,
  onApprovalError,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();

  // ============================================================================
  // STATE
  // ============================================================================

  const [stage, setStage] = useState<
    'review' | 'creating' | 'assigning' | 'complete'
  >('review');
  const [pendingAssignment, setPendingAssignment] =
    useState<PendingAssignment | null>(null);
  const [selectedReviewers, setSelectedReviewers] = useState<{
    technical: `0x${string}` | null;
    final: `0x${string}` | null;
  }>({ technical: null, final: null });
  const [isTransactionPending, setIsTransactionPending] = useState(false);

  // ============================================================================
  // TRANSACTION CONSTRUCTION
  // ============================================================================

  const buildBountyCreationCalls = (): TransactionCallData[] => {
    const contractAddress = process.env
      .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
    const tokenAddress =
      bounty.value.token === 'SYSTEM'
        ? (process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`)
        : (process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`);

    const decimals = 18; // ERC20 standard
    const amountWei = parseUnits(String(bid.proposedAmount), decimals);
    const paymentType = getPaymentType(bid.paymentOption);
    const ipfsHash = `bounty-${bounty.id}-${Date.now()}`;

    const calls: TransactionCallData[] = [];

    // Call 1: Approve token spending
    console.log('💰 Adding token approval call for bid approval flow');
    calls.push({
      address: tokenAddress,
      abi: [
        {
          name: 'approve',
          type: 'function',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ],
      functionName: 'approve',
      args: [contractAddress, amountWei],
    });

    // Call 2: Create bounty
    console.log('🏗️ Adding createBounty call');
    calls.push({
      address: contractAddress,
      abi: BountyManagerABI,
      functionName: 'createBounty',
      args: [
        amountWei, // uint128 value
        tokenAddress, // address token
        paymentType, // uint8 paymentType
        bounty.podId, // string podId
        ipfsHash, // string ipfsHash
      ],
    });

    console.log('🔧 Transaction calls prepared:', {
      totalCalls: calls.length,
      call1: 'ERC20.approve() - Allow BountyManager to spend tokens',
      call2: 'BountyManagerV2.createBounty() - Create bounty with escrow',
      approveAmount: amountWei.toString(),
      bountyAmount: amountWei.toString(),
      tokenAddress,
      paymentType,
      podId: bounty.podId,
      ipfsHash,
      contractAddress,
    });

    return calls;
  };

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleApprove = async (
    techReviewer: `0x${string}`,
    finalApprover: `0x${string}`,
  ) => {
    console.log('🎯 Starting approval flow:', {
      bidId: bid.id,
      bountyId: bounty.id,
      existingOnchainId: bounty.onchain_id,
      techReviewer,
      finalApprover,
    });

    // Check bid acceptance limits
    const { canAccept, reason } = await canAcceptMoreBids(bounty.id);

    if (!canAccept) {
      console.error('❌ Bid limit reached:', reason);
      alert(
        `Cannot approve bid:\n\n${reason}\n\nPlease adjust the bounty settings or wait for the deadline to pass.`,
      );
      onApprovalError(new Error(reason || 'Bid limit reached'));
      return;
    }

    setSelectedReviewers({
      technical: techReviewer,
      final: finalApprover,
    });

    // Check if bounty already exists on-chain
    if (bounty.onchain_id) {
      console.log(
        '✅ Bounty already exists on-chain with ID:',
        bounty.onchain_id,
      );
      console.log('⏭️ Skipping bounty creation, going directly to assignment');

      // Debug: Log bid object to verify onchainBidIndex field
      console.log('🔍 Bid object before validation:', {
        bidId: bid.id,
        onchainBidIndex: bid.onchainBidIndex,
        onchainBidIndexType: typeof bid.onchainBidIndex,
        hasField: 'onchainBidIndex' in bid,
        placementTxHash: bid.placementTxHash,
        submittedAt: bid.submittedAt,
      });

      // Validate bid index exists (note: 0 is a valid index!)
      if (bid.onchainBidIndex === undefined || bid.onchainBidIndex === null) {
        const timeSinceSubmission = bid.submittedAt
          ? Date.now() - new Date(bid.submittedAt).getTime()
          : 0;
        const minutesSinceSubmission = Math.floor(timeSinceSubmission / 1000 / 60);

        let errorMessage = 'Bid is missing onchainBidIndex - cannot approve.';

        if (bid.placementTxHash && minutesSinceSubmission < 10) {
          errorMessage += ` The bid was submitted ${minutesSinceSubmission} minute(s) ago. The system syncs on-chain data every 5 minutes. Please wait a moment and try refreshing the page.`;
        } else if (bid.placementTxHash) {
          errorMessage += ` The bid has a placement transaction (${bid.placementTxHash.substring(0, 10)}...) but the on-chain index hasn't been synced yet. Try refreshing the page to load the latest data.`;
        } else {
          errorMessage += ' The bid must be placed on-chain first.';
        }

        const error = new Error(errorMessage);
        console.error('❌', error.message);
        console.error('💡 Bid details:', {
          id: bid.id,
          hasPlacementTx: !!bid.placementTxHash,
          minutesSinceSubmission,
          onchainBidIndex: bid.onchainBidIndex,
        });
        onApprovalError(error);
        return;
      }

      console.log('✅ Bid validation passed - onchainBidIndex:', bid.onchainBidIndex);

      // Prepare assignment data using existing bounty ID
      const assignmentData: PendingAssignment = {
        onchainBountyId: String(bounty.onchain_id),
        onchainBidIndex: bid.onchainBidIndex, // ✅ Use correct field name
        reviewer: techReviewer,
        approver: finalApprover,
      };

      console.log(
        '📋 Assignment details prepared (using existing bounty):',
        assignmentData,
      );

      setPendingAssignment(assignmentData);
      setStage('assigning');
    } else {
      console.log(
        '🏗️ Bounty not yet created on-chain, will create during approval',
      );
      setStage('creating');
    }
  };

  const handleBountyCreationSuccess = (receipts: any[]) => {
    console.log('✅ Bounty creation succeeded, extracting bounty ID...');

    const contractAddress = process.env
      .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
    const createBountyReceipt = receipts[receipts.length - 1];
    const logs = createBountyReceipt?.logs;

    const onchainBountyId = extractBountyIdFromLogs(logs, contractAddress);

    if (!onchainBountyId) {
      const error = new Error(
        'Failed to extract bounty ID from transaction logs',
      );
      console.error('❌', error.message);
      onApprovalError(error);
      setStage('review');
      return;
    }

    console.log('✅ Bounty created on-chain with ID:', onchainBountyId);
    console.log('🔄 Preparing assignment transaction...');

    // Validate bid index exists
    if (bid.onchainBidIndex === undefined || bid.onchainBidIndex === null) {
      const error = new Error(
        'Bid is missing onchainBidIndex - cannot approve. Bid must be placed on-chain first.',
      );
      console.error('❌', error.message);
      onApprovalError(error);
      setStage('review');
      return;
    }

    // Prepare assignment data
    const assignmentData: PendingAssignment = {
      onchainBountyId,
      onchainBidIndex: bid.onchainBidIndex, // ✅ Use correct field name, no fallback
      reviewer: selectedReviewers.technical!,
      approver: selectedReviewers.final!,
    };

    console.log('📋 Assignment details prepared:', assignmentData);

    setPendingAssignment(assignmentData);
    setStage('assigning');
  };

  const handleBountyCreationError = async (error: Error) => {
    console.error('❌ Bounty creation failed:', error);

    if (!evmAddress || !publicClient) {
      onApprovalError(error);
      setStage('review');
      return;
    }

    const calls = buildBountyCreationCalls();

    await handleTransactionError(
      error,
      'Bounty Creation',
      calls,
      evmAddress,
      publicClient,
    );

    onApprovalError(error);
    setStage('review');
  };

  const handleAssignmentSuccess = (receipt: TransactionReceipt) => {
    console.log('✅ Assignment succeeded:', receipt.transactionHash);
    setStage('complete');

    // Brief delay before closing to show success state
    setTimeout(() => {
      setPendingAssignment(null);
      setSelectedReviewers({ technical: null, final: null });
      setStage('review');
      onApprovalComplete();
    }, 1500);
  };

  const handleAssignmentError = (error: Error) => {
    console.error('❌ Assignment failed:', error);

    alert(
      `Bounty was created but assignment failed.\n\n` +
        `Error: ${error.message}\n\n` +
        `The bounty exists on-chain but is not assigned to the bidder. ` +
        `Please contact support to complete the assignment manually.`,
    );

    setPendingAssignment(null);
    setStage('review');
    onApprovalError(error);
  };

  const handleAssignmentComplete = () => {
    console.log('✅ Assignment transaction completed (success or error)');
  };

  const handleDialogClose = () => {
    if (stage === 'creating' || stage === 'assigning') {
      // Don't allow closing during transactions
      return;
    }
    onClose();
  };

  // ============================================================================
  // TRANSACTION STATUS HANDLER
  // ============================================================================

  const bountyCreationStatusHandler = createTransactionStatusHandler(
    {
      onSuccess: (receipt) => {
        const receipts = [receipt]; // Wrap in array for consistency
        handleBountyCreationSuccess(receipts);
      },
      onError: handleBountyCreationError,
    },
    'Bounty Creation',
  );

  const onBountyCreationStatus = (status: any) => {
    console.log('🔔 Bounty creation status:', {
      statusName: status.statusName,
      hasReceipts: !!status.transactionReceipts,
    });

    // Extract receipts from different possible locations
    const receipts =
      status.transactionReceipts || status.statusData?.transactionReceipts;

    if (status.statusName === 'success' && receipts && receipts.length > 0) {
      handleBountyCreationSuccess(receipts);
    } else if (status.statusName === 'error') {
      handleBountyCreationError(
        status.error || new Error('Transaction failed'),
      );
    } else {
      // For other statuses, use the standard handler
      bountyCreationStatusHandler(status);
    }
  };

  // ============================================================================
  // CDP SMART ACCOUNT TRANSACTION HANDLER
  // ============================================================================

  const handleCreateBountyTransaction = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for bounty creation:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      handleBountyCreationError(new Error('Smart Wallet not properly configured'));
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for bounty creation...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - createBounty (multi-call)');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
      const tokenAddress =
        bounty.value.token === 'SYSTEM'
          ? (process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`)
          : (process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`);

      const decimals = 18; // ERC20 standard
      const amountWei = parseUnits(String(bid.proposedAmount), decimals);
      const paymentType = getPaymentType(bid.paymentOption);
      const ipfsHash = `bounty-${bounty.id}-${Date.now()}`;

      // EXACT FAUCET PATTERN: Encode call data for multi-call
      // Call 1: Approve token spending
      const approveCallData = encodeFunctionData({
        abi: [
          {
            name: 'approve',
            type: 'function',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'approve',
        args: [contractAddress, amountWei],
      });

      // Call 2: Create bounty
      const createBountyCallData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'createBounty',
        args: [
          amountWei, // uint128 value
          tokenAddress, // address token
          paymentType, // uint8 paymentType
          bounty.podId, // string podId
          ipfsHash, // string ipfsHash
        ],
      });

      console.log('📝 Encoded call data for approve + createBounty');

      // EXACT FAUCET PATTERN: Send user operation (multi-call)
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: [
          {
            to: tokenAddress,
            value: 0n,
            data: approveCallData,
          },
          {
            to: contractAddress,
            value: 0n,
            data: createBountyCallData,
          },
        ],
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation sent successfully!', result);

      // Handle success with receipt
      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        const receipt = resultWithReceipt.receipt as TransactionReceipt;

        // Extract bounty ID from logs
        const onchainBountyId = extractBountyIdFromLogs(receipt.logs, contractAddress);

        if (!onchainBountyId) {
          handleBountyCreationError(
            new Error('Failed to extract bounty ID from transaction logs')
          );
          return;
        }

        console.log('✅ Bounty created on-chain with ID:', onchainBountyId);
        console.log('🔄 Preparing assignment transaction...');

        // Validate bid index exists
        if (bid.onchainBidIndex === undefined || bid.onchainBidIndex === null) {
          handleBountyCreationError(
            new Error('Bid is missing onchainBidIndex - cannot approve. Bid must be placed on-chain first.')
          );
          return;
        }

        // Prepare assignment data
        const assignmentData: PendingAssignment = {
          onchainBountyId,
          onchainBidIndex: bid.onchainBidIndex,
          reviewer: selectedReviewers.technical!,
          approver: selectedReviewers.final!,
        };

        console.log('📋 Assignment details prepared:', assignmentData);

        setPendingAssignment(assignmentData);
        setStage('assigning');
      } else {
        console.warn('⚠️ No receipt found in result');
        handleBountyCreationError(new Error('Transaction completed but no receipt found'));
      }
    } catch (err: any) {
      console.error('❌ Bounty creation failed:', err);
      await handleBountyCreationError(err);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  // Stage 1: Review Dialog
  if (stage === 'review') {
    return (
      <BidApprovalDialog
        open={open}
        onClose={handleDialogClose}
        bid={bid}
        bountyTitle={bounty.title}
        tokenSymbol={tokenSymbol}
        onApprove={handleApprove}
        isApproving={false}
        readOnly={false}
      />
    );
  }

  // Stage 2: Creating Bounty
  if (stage === 'creating') {
    return (
      <Dialog
        open={true}
        onOpenChange={() => {
          /* Don't allow closing */
        }}
      >
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-md">
          <DialogHeader>
            <DialogTitle>Creating Bounty</DialogTitle>
            <DialogDescription>
              Creating bounty on-chain and setting up escrow...
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-4">
            <p className="text-sm text-gray-600">
              This will create the bounty on-chain with escrow. After this
              succeeds, the bounty will be assigned to the winning bidder.
            </p>

            {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
              <Button
                onClick={handleCreateBountyTransaction}
                disabled={isTransactionPending}
                className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold py-3 transition-colors hover:opacity-90"
              >
                {isTransactionPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                    Creating Bounty...
                  </>
                ) : (
                  'Create Bounty'
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
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Stage 3: Assigning Bounty
  if (stage === 'assigning' && pendingAssignment) {
    return (
      <Dialog
        open={true}
        onOpenChange={() => {
          /* Don't allow closing */
        }}
      >
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-md">
          <DialogHeader>
            <DialogTitle>Assigning Bounty</DialogTitle>
            <DialogDescription>
              Completing bounty assignment and setting up escrow...
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-4">
            <p className="text-sm text-gray-600">
              Bounty created successfully! Now assigning it to the bidder and
              setting up escrow.
            </p>

            <BountyAssignmentTransaction
              onchainBountyId={pendingAssignment.onchainBountyId}
              onchainBidIndex={pendingAssignment.onchainBidIndex}
              reviewer={pendingAssignment.reviewer}
              approver={pendingAssignment.approver}
              bidId={bid.id}
              bountyId={bounty.id}
              bidderAddress={bid.bidderAddress}
              onSuccess={handleAssignmentSuccess}
              onError={handleAssignmentError}
              onComplete={handleAssignmentComplete}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Stage 4: Complete
  if (stage === 'complete') {
    return (
      <Dialog
        open={true}
        onOpenChange={() => {
          /* Don't allow closing */
        }}
      >
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-md">
          <DialogHeader>
            <DialogTitle>Approval Complete!</DialogTitle>
            <DialogDescription>
              Bid approved and bounty assigned successfully.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-4">
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: '#D1E6DC',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#B8D9CA',
              }}
            >
              <p className="font-semibold" style={{ color: '#1F453A' }}>
                ✅ Success!
              </p>
              <p className="text-sm mt-2" style={{ color: '#2F5D50' }}>
                The bid has been approved, the bounty has been created on-chain,
                and it has been assigned to the winning bidder. Funds are now in
                escrow.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return null;
};

export default BidApprovalFlow;

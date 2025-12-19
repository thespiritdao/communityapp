'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';
import type { Abi } from 'viem';

const BountyManagerABI = BountyManagerABIJson as Abi;
import { format, parseISO, isValid } from 'date-fns';
import { CheckCircle, Loader2 } from 'lucide-react';
import { useBountySupabase } from '../hooks/useBountySupabase';
import type { FrontendBid, FrontendNotification } from '../types/bounty';
import UserTagging from '@/components/UserTagging';
import { isAddress, parseUnits, encodeFunctionData } from 'viem';
import { PaymentStructure } from '../hooks/useBountyContractEnhanced';
import { BaseError } from 'viem';
import { unifiedNotificationService } from '@/services/unifiedNotificationService';
import { PodValidationService } from '../services/PodValidationService';
import { usePodValidation } from '../hooks/usePodValidation';

const BASE_CHAIN_ID = 8453; // Base mainnet chain ID

// Utility function to get token display symbol
const getTokenSymbol = (tokenType: 'SYSTEM' | 'SELF'): string => {
  return tokenType === 'SYSTEM' ? '$SYSTEM' : '$SELF';
};

// Utility function to extract bounty ID from transaction receipt logs
const extractBountyIdFromLogs = (
  logs: any[],
  bountyManagerAddress: string,
): string | null => {
  try {
    // Look for BountyCreated event from BountyManager contract
    // Event signature: BountyCreated(uint256 indexed id, address indexed creator, string podId, string ipfsHash)
    // The indexed bounty ID is in topics[1]
    const bountyCreatedLog = logs?.find(
      (log) =>
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

// Add error logging utility with rate limiting
const ERROR_LOG_KEY = 'commapp_bounty_error_logs';
const MAX_LOGS = 100; // Maximum number of logs to keep

const logError = async (error: unknown, context: string) => {
  try {
    const timestamp = new Date().toISOString();
    const errorLog = {
      timestamp,
      context,
      error:
        error instanceof Error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
              ...(error instanceof BaseError && {
                details: error.details,
                shortMessage: error.shortMessage,
              }),
            }
          : error,
    };

    // Log to console with grouping
    console.group(`Error Log - ${context}`);
    console.log('Timestamp:', timestamp);
    console.log('Context:', context);
    console.log('Error Details:', errorLog.error);
    console.groupEnd();

    // Store in localStorage with rate limiting
    try {
      const existingLogsStr = localStorage.getItem(ERROR_LOG_KEY);
      const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];

      // Add new log and maintain max size
      existingLogs.unshift(errorLog);
      if (existingLogs.length > MAX_LOGS) {
        existingLogs.length = MAX_LOGS;
      }

      localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(existingLogs));
    } catch (storageError) {
      console.error('Failed to store error log:', storageError);
    }

    // Additional error details for debugging
    if (error instanceof Error) {
      console.error('Additional error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        }),
      });
    }
  } catch (e) {
    console.error('Error in logError:', e);
  }
};

// Add transaction data validation utility
const validateTransactionData = (data: any) => {
  const validation = {
    isValid: true,
    issues: [] as string[],
    data: {} as any,
  };

  try {
    // Deep clone the data to avoid modifying the original
    validation.data = JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }),
    );

    // Validate required fields
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');

    // Validate calls array
    if (Array.isArray(validation.data.calls)) {
      validation.data.calls.forEach((call: any, index: number) => {
        if (!call.address)
          validation.issues.push(`Call ${index}: Missing address`);
        if (!call.abi) validation.issues.push(`Call ${index}: Missing ABI`);
        if (!call.functionName)
          validation.issues.push(`Call ${index}: Missing functionName`);
        if (!Array.isArray(call.args))
          validation.issues.push(`Call ${index}: Missing args array`);
      });
    } else {
      validation.issues.push('Calls is not an array');
    }

    validation.isValid = validation.issues.length === 0;
  } catch (e) {
    validation.isValid = false;
    validation.issues.push(
      `Serialization error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return validation;
};

const validatePaymasterConfig = () => {
  const paymasterEndpoint = process.env.NEXT_PUBLIC_PAYMASTER;
  if (!paymasterEndpoint) {
    console.error('Paymaster endpoint not configured');
    return false;
  }

  // Validate paymaster endpoint format
  try {
    new URL(paymasterEndpoint);
    return true;
  } catch (e) {
    console.error('Invalid paymaster endpoint URL:', paymasterEndpoint);
    return false;
  }
};

const logTransactionLifecycle = (stage: string, data: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Transaction ${stage}:`, {
    ...data,
    paymasterConfig: {
      endpoint: process.env.NEXT_PUBLIC_PAYMASTER,
      isValid: validatePaymasterConfig(),
    },
  });
};

const simulateTransaction = async (
  calls: any[],
  publicClient: any,
  userAddress: string,
) => {
  try {
    const simulation = await publicClient.simulateContract({
      ...calls[0],
      account: userAddress,
    });

    console.log('Transaction simulation successful:', {
      simulation,
      calls: calls[0],
      account: userAddress,
    });

    return true;
  } catch (error) {
    console.error('Transaction simulation failed:', {
      error,
      calls: calls[0],
      account: userAddress,
    });
    return false;
  }
};

const isCoinbaseWalletError = (error: any): boolean => {
  return (
    error?.message?.includes('scanTxTimeout') ||
    error?.message?.includes('api.wallet.coinbase.com')
  );
};

const checkETHBalance = async (
  address: string,
  publicClient: any,
): Promise<boolean> => {
  try {
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });
    // We need at least 0.001 ETH for gas
    const minRequired = BigInt('1000000000000000'); // 0.001 ETH in wei
    return balance >= minRequired;
  } catch (error) {
    console.error('Error checking ETH balance:', error);
    return false;
  }
};

const logWalletState = async (userAddress: string, publicClient: any) => {
  try {
    const [balance, blockNumber] = await Promise.all([
      publicClient.getBalance({ address: userAddress as `0x${string}` }),
      publicClient.getBlockNumber(),
    ]);

    console.log('Wallet State:', {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      blockNumber: blockNumber.toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging wallet state:', error);
  }
};

const logNetworkConditions = async (publicClient: any) => {
  try {
    const [gasPrice, block] = await Promise.all([
      publicClient.getGasPrice(),
      publicClient.getBlock(),
    ]);

    console.log('Network Conditions:', {
      gasPrice: gasPrice.toString(),
      gasPriceInGwei: Number(gasPrice) / 1e9,
      blockNumber: block.number.toString(),
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      baseFeePerGas: block.baseFeePerGas?.toString(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error logging network conditions:', error);
  }
};

const logTransactionParameters = (calls: any[], isSponsored: boolean) => {
  console.log('Transaction Parameters:', {
    calls: calls.map((call) => ({
      address: call.address,
      functionName: call.functionName,
      args: call.args.map((arg: any) => {
        if (typeof arg === 'bigint') {
          return {
            value: arg.toString(),
            type: 'bigint',
          };
        }
        return arg;
      }),
    })),
    isSponsored,
    timestamp: new Date().toISOString(),
  });
};

const getTransactionConfig = async (userAddress: string, publicClient: any) => {
  try {
    // Log initial state
    await logWalletState(userAddress, publicClient);
    await logNetworkConditions(publicClient);

    const hasETH = await checkETHBalance(userAddress, publicClient);
    const paymasterStatus = validatePaymasterConfig();

    console.log('Transaction Configuration Decision:', {
      hasETH,
      paymasterStatus,
      address: userAddress,
      timestamp: new Date().toISOString(),
      decision:
        hasETH && !paymasterStatus
          ? 'non-sponsored'
          : hasETH && paymasterStatus
            ? 'sponsored-with-fallback'
            : !hasETH && paymasterStatus
              ? 'sponsored-only'
              : 'cannot-proceed',
    });

    // If we have ETH and paymaster is not working, use non-sponsored
    if (hasETH && !paymasterStatus) {
      console.log('Using non-sponsored transaction due to paymaster issues');
      return { isSponsored: false };
    }

    // If we have ETH but paymaster is working, try sponsored first
    if (hasETH && paymasterStatus) {
      console.log('Using sponsored transaction with ETH fallback available');
      return { isSponsored: true, hasFallback: true };
    }

    // If no ETH, we must use sponsored
    if (!hasETH && paymasterStatus) {
      console.log('Using sponsored transaction (no ETH available)');
      return { isSponsored: true, hasFallback: false };
    }

    // If no ETH and no paymaster, we can't proceed
    throw new Error('No ETH for gas and paymaster not available');
  } catch (error) {
    console.error('Error getting transaction config:', error);
    throw error;
  }
};

const handleTransactionError = async (
  error: Error,
  context: string,
  calls: any[],
  userAddress: string,
  publicClient: any,
) => {
  try {
    if (!userAddress) {
      throw new Error('No user address available');
    }

    // Log state before error handling
    await logWalletState(userAddress, publicClient);
    await logNetworkConditions(publicClient);

    const simulationSuccess = await simulateTransaction(
      calls,
      publicClient,
      userAddress,
    );

    // Get current transaction config
    const txConfig = await getTransactionConfig(userAddress, publicClient);
    const isCoinbaseError = isCoinbaseWalletError(error);

    // Log transaction parameters
    logTransactionParameters(calls, txConfig.isSponsored);

    logTransactionLifecycle('Error', {
      type: context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        isCoinbaseError,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        }),
      },
      transactionData: {
        address: userAddress,
        chainId: BASE_CHAIN_ID,
        calls,
        ...txConfig,
        simulationSuccess,
        walletType: 'coinbase',
        timestamp: new Date().toISOString(),
      },
    });

    // If it's a Coinbase Wallet error and we have a fallback available
    if (isCoinbaseError && txConfig.hasFallback) {
      console.warn(
        'Coinbase Wallet error detected with fallback available. Retrying with non-sponsored transaction...',
        {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      );
      return { shouldRetry: true, useSponsored: false };
    }

    await logError(error, `${context} Transaction Error`);
    return { shouldRetry: false };
  } catch (e) {
    console.error(`Error in ${context} error handler:`, e);
    return { shouldRetry: false };
  }
};

interface BidReviewManagerProps {
  onBidStatusChange?: () => void;
  onNotificationSent?: (notification: FrontendNotification) => void;
}

// Interface for pending assignment data
interface PendingAssignment {
  onchainBountyId: string;
  onchainBidIndex: number; // Index from contract bids array (tracked from placeBid)
  reviewer: `0x${string}`;
  approver: `0x${string}`;
  bidId: string;
  bountyId: string;
  bidderAddress: string;
}

export const BidReviewManager: React.FC<BidReviewManagerProps> = ({
  onBidStatusChange,
  onNotificationSent,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();
  const [activeTab, setActiveTab] = useState<
    'pending' | 'approved' | 'rejected'
  >('pending');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedBid, setSelectedBid] = useState<FrontendBid | null>(null);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [pendingAssignment, setPendingAssignment] =
    useState<PendingAssignment | null>(null);
  const [isCreationPending, setIsCreationPending] = useState(false);
  const [isAssignmentPending, setIsAssignmentPending] = useState(false);
  const {
    bids,
    bounties,
    loadAllBids,
    loadBounties,
    updateBidStatus,
    createBidReview,
  } = useBountySupabase();
  const {
    validateMultiplePods,
    getValidatedPodId,
    getPodValidationStatus,
    isValidating,
  } = usePodValidation();

  useEffect(() => {
    loadAllBids();
    loadBounties();
  }, [loadAllBids, loadBounties]);

  // Validate pod IDs only when viewing pending bids to avoid rate limiting
  // Validation is expensive and only needed before approval
  useEffect(() => {
    if (activeTab === 'pending' && bounties.length > 0) {
      const podIds = bounties.map((bounty) => bounty.pod_id).filter(Boolean);
      if (podIds.length > 0) {
        console.log('🔄 Pre-validating pod IDs for pending bounties:', podIds);
        validateMultiplePods(podIds);
      }
    }
  }, [activeTab, bounties, validateMultiplePods]);

  const getBountyTitle = (bountyId: string) => {
    const bounty = bounties.find((b) => b.id === bountyId);
    return bounty?.title || bountyId;
  };

  const getTokenSymbolForBid = (bidBountyId: string): string => {
    const bounty = bounties.find((b) => b.id === bidBountyId);
    return bounty ? getTokenSymbol(bounty.value.token) : 'tokens';
  };

  const extractAddress = (
    mention: string | undefined,
  ): `0x${string}` | null => {
    if (!mention) return null;
    const match = mention.match(/@\[.*?\]\((0x[a-fA-F0-9]{40})\)/);
    const address = match ? match[1] : mention;
    return isAddress(address) ? (address as `0x${string}`) : null;
  };

  const handleReviewBid = (bid: FrontendBid) => {
    setSelectedBid(bid);
    setReviewDialogOpen(true);
  };

  const handleRejectBid = async () => {
    if (!selectedBid || !rejectionReason || !evmAddress) return;
    try {
      console.log('🔍 Starting bid rejection for bid ID:', selectedBid.id);

      // Update bid status
      await updateBidStatus(selectedBid.id, 'rejected');
      console.log('✅ Bid status updated successfully');
      onBidStatusChange?.();

      // Create bid review record
      console.log('🔍 Creating bid review for bid ID:', selectedBid.id);
      await createBidReview({
        bidId: selectedBid.id,
        reviewerAddress: evmAddress,
        reviewType: 'final',
        status: 'rejected',
        comments: rejectionReason,
      });
      console.log('✅ Bid review created successfully');

      // Send notification using unified service
      await unifiedNotificationService.createNotification({
        recipient_address: selectedBid.bidderAddress,
        sender_address: evmAddress,
        notification_type: 'bounty_update',
        title: 'Bid Update',
        message: `Your bid for "${getBountyTitle(selectedBid.bountyId)}" was not selected. Reason: ${rejectionReason}`,
        context_type: 'bounty',
        context_id: selectedBid.bountyId,
        context_url: `/bounty/${selectedBid.bountyId}`,
        priority: 'medium',
      });

      setRejectionDialogOpen(false);
      setSelectedBid(null);
      setRejectionReason('');
      await loadAllBids();
    } catch (error) {
      console.error('❌ Error rejecting bid:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'approved':
        return <Badge variant="default">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPaymentOptionLabel = (option: string) => {
    switch (option) {
      case 'completion':
        return 'Pay on Completion';
      case 'milestones':
        return 'Pay per Milestone';
      case 'split':
        return 'Split Payment';
      default:
        return option;
    }
  };

  const filteredBids = bids.filter((bid) => bid.status === activeTab);

  // ============================================================================
  // CDP SMART ACCOUNT TRANSACTION HANDLERS
  // ============================================================================

  // Handler for bounty creation (approve + createBounty multi-call)
  const handleCreateBountyTransaction = async (
    bounty: any,
    selectedBid: FrontendBid,
    techReviewerAddress: `0x${string}`,
    finalApproverAddress: `0x${string}`,
    calls: any[]
  ) => {
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for bounty creation');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0];
    setIsCreationPending(true);

    try {
      console.log('🚀 Building Smart Account User Operation for bounty creation...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - approve + createBounty (multi-call)');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      // Encode all call data
      const encodedCalls = calls.map(call => ({
        to: call.address,
        value: 0n,
        data: encodeFunctionData({
          abi: call.abi,
          functionName: call.functionName,
          args: call.args,
        }),
      }));

      console.log('📝 Encoded call data for multi-call transaction');

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: encodedCalls,
        useCdpPaymaster: true,
      });

      console.log('✅ User operation sent successfully!', result);

      // Type assertion needed due to incomplete CDP SDK types
      const resultWithReceipt = result as any;
      if (resultWithReceipt?.receipt) {
        const receipt = resultWithReceipt.receipt;
        const logs = receipt.logs;

        // Extract bounty ID from logs
        const onchainBountyId = extractBountyIdFromLogs(logs, contractAddress);

        if (onchainBountyId) {
          console.log('✅ Bounty created on-chain with ID:', onchainBountyId);

          // Prepare assignment data
          const assignmentData: PendingAssignment = {
            onchainBountyId,
            onchainBidIndex: selectedBid.onchainBidIndex || 0,
            reviewer: techReviewerAddress,
            approver: finalApproverAddress,
            bidId: selectedBid.id,
            bountyId: selectedBid.bountyId,
            bidderAddress: selectedBid.bidderAddress,
          };

          console.log('📋 Assignment details prepared:', assignmentData);
          setPendingAssignment(assignmentData);
        } else {
          console.error('❌ Could not extract bounty ID from transaction logs');
          setReviewDialogOpen(false);
        }
      }
    } catch (err: any) {
      console.error('❌ Bounty creation failed:', err);
      alert(`Failed to create bounty: ${err.message}`);
    } finally {
      setIsCreationPending(false);
    }
  };

  // Handler for bounty assignment
  const handleAssignBountyTransaction = async (assignment: PendingAssignment) => {
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for assignment');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0];
    setIsAssignmentPending(true);

    try {
      console.log('🚀 Building Smart Account User Operation for bounty assignment...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - assignBounty');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;

      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'assignBounty',
        args: [
          BigInt(assignment.onchainBountyId),
          BigInt(assignment.onchainBidIndex),
          assignment.reviewer,
          assignment.approver,
        ],
      });

      console.log('📝 Encoded call data for assignBounty');

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: contractAddress,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Assignment successful!', result);

      // Update bid status in database
      await updateBidStatus(
        assignment.bidId,
        'approved',
        assignment.reviewer,
        assignment.approver,
      );
      onBidStatusChange?.();

      // Send notifications
      await Promise.all([
        unifiedNotificationService.createNotification({
          recipient_address: assignment.bidderAddress,
          sender_address: evmAddress,
          notification_type: 'bounty_update',
          title: 'Bid Approved & Bounty Assigned!',
          message: 'Your bid has been approved and the bounty has been assigned to you. Funds are now in escrow.',
          context_type: 'bounty',
          context_id: assignment.bountyId,
          context_url: `/bounty/${assignment.bountyId}`,
          priority: 'high',
        }),
        unifiedNotificationService.createNotification({
          recipient_address: assignment.reviewer,
          sender_address: evmAddress,
          notification_type: 'bounty_update',
          title: 'Technical Reviewer Assignment',
          message: 'You have been assigned as Technical Reviewer for a bounty.',
          context_type: 'bounty',
          context_id: assignment.bountyId,
          context_url: `/bounty/${assignment.bountyId}`,
          priority: 'high',
        }),
        unifiedNotificationService.createNotification({
          recipient_address: assignment.approver,
          sender_address: evmAddress,
          notification_type: 'bounty_update',
          title: 'Final Approver Assignment',
          message: 'You have been assigned as Final Approver for a bounty.',
          context_type: 'bounty',
          context_id: assignment.bountyId,
          context_url: `/bounty/${assignment.bountyId}`,
          priority: 'high',
        }),
      ]);

      // Clear and reload
      setPendingAssignment(null);
      await loadAllBids();
      console.log('✅ Bounty approval and assignment complete!');
    } catch (err: any) {
      console.error('❌ Assignment failed:', err);
      alert(`Failed to assign bounty: ${err.message}\n\nThe bounty was created but not assigned. Please contact support.`);
      setPendingAssignment(null);
    } finally {
      setIsAssignmentPending(false);
    }
  };

  // Debug logging to see what's happening with bid statuses
  useEffect(() => {
    console.log('🔍 BidReviewManager Debug:');
    console.log('All bids:', bids);
    console.log('All bounties:', bounties);
    console.log('Active tab:', activeTab);
    console.log('Filtered bids:', filteredBids);
    console.log(
      'Bid statuses:',
      bids.map((bid) => ({
        id: bid.id,
        status: bid.status,
        bountyId: bid.bountyId,
      })),
    );
  }, [bids, bounties, activeTab, filteredBids]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center mb-6">
        <h2 className="text-2xl font-bold">Review Bids</h2>
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab('pending')}
            variant={activeTab === 'pending' ? 'default' : 'outline'}
            size="sm"
          >
            Pending
          </Button>
          <Button
            onClick={() => setActiveTab('approved')}
            variant={activeTab === 'approved' ? 'default' : 'outline'}
            size="sm"
          >
            Approved
          </Button>
          <Button
            onClick={() => setActiveTab('rejected')}
            variant={activeTab === 'rejected' ? 'default' : 'outline'}
            size="sm"
          >
            Rejected
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBids.map((bid) => (
          <Card key={bid.id} className="w-full">
            <CardHeader>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg truncate">
                    {getBountyTitle(bid.bountyId)}
                  </CardTitle>
                  <p className="text-sm text-gray-600 truncate">
                    {bid.first_name || bid.last_name
                      ? `${bid.first_name || ''} ${bid.last_name || ''}`.trim()
                      : bid.bidderAddress}
                  </p>
                </div>
                {getStatusBadge(bid.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Amount</p>
                  <p>
                    {bid.proposedAmount} {getTokenSymbolForBid(bid.bountyId)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Payment</p>
                  <p>{getPaymentOptionLabel(bid.paymentOption)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Submitted</p>
                  <p>{format(bid.submittedAt, 'MMM dd, yyyy')}</p>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={() => handleReviewBid(bid)}
                    className="flex-1"
                    style={{ backgroundColor: '#8FAAA1', color: '#1F2D2A' }}
                  >
                    View Details
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedBid(bid);
                      setRejectionDialogOpen(true);
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-5xl">
          <DialogHeader>
            <DialogTitle>Review & Approve Bid</DialogTitle>
            <DialogDescription>
              Review the bid details and assign reviewers before approval.
            </DialogDescription>
          </DialogHeader>

          {selectedBid ? (
            <div className="space-y-6 max-h-[70vh] overflow-y-auto px-1">
              {/* Bid Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">
                  {getBountyTitle(selectedBid.bountyId)}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>
                    Bidder:{' '}
                    {selectedBid.first_name || selectedBid.last_name
                      ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                      : selectedBid.bidderAddress}
                  </p>
                  <p>
                    Amount: {selectedBid.proposedAmount}{' '}
                    {getTokenSymbolForBid(selectedBid.bountyId)}
                  </p>
                  <p>
                    Payment: {getPaymentOptionLabel(selectedBid.paymentOption)}
                  </p>
                  <p>
                    Submitted: {format(selectedBid.submittedAt, 'MMM dd, yyyy')}
                  </p>
                </div>
              </div>

              {/* Experience */}
              <div>
                <h4 className="font-medium mb-2">Relevant Experience</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {selectedBid.experience}
                  </p>
                </div>
              </div>

              {/* Plan of Action */}
              <div>
                <h4 className="font-medium mb-2">Plan of Action</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {selectedBid.planOfAction}
                  </p>
                </div>
              </div>

              {/* Deliverables */}
              <div>
                <h4 className="font-medium mb-2">Deliverables</h4>
                <div className="space-y-2">
                  {Array.isArray(selectedBid.deliverables) &&
                  selectedBid.deliverables.length > 0 ? (
                    selectedBid.deliverables.map((deliverable, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-grow">
                            <p className="text-gray-700">
                              {deliverable.description}
                            </p>
                            <div className="text-sm text-gray-600">
                              <p>
                                Due: {(() => {
                                  const dateObj =
                                    typeof deliverable.due_date === 'string'
                                      ? parseISO(deliverable.due_date)
                                      : deliverable.due_date;
                                  return isValid(dateObj)
                                    ? format(dateObj, 'MMM dd, yyyy')
                                    : 'Invalid date';
                                })()}
                              </p>
                              <p>
                                Amount: {deliverable.payment_amount}{' '}
                                {getTokenSymbolForBid(selectedBid.bountyId)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-500 italic">
                        No deliverables specified
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-medium mb-2">Timeline</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {selectedBid.timeline}
                  </p>
                </div>
              </div>

              {/* Reviewer Assignment */}
              <div className="space-y-4">
                <div>
                  <Label>
                    Technical Reviewer{' '}
                    {selectedBid?.status === 'approved' && '(Assigned)'}
                  </Label>
                  {selectedBid?.status === 'approved' ? (
                    <div className="p-2 bg-gray-100 rounded border text-gray-700">
                      {selectedReviewers[0] ||
                        selectedBid?.technical_reviewer ||
                        'Not assigned'}
                    </div>
                  ) : (
                    <UserTagging
                      value={selectedReviewers[0] || ''}
                      onChange={(value) =>
                        setSelectedReviewers([value, selectedReviewers[1]])
                      }
                      placeholder="Type @ to mention a reviewer..."
                      contextType="bounty"
                      contextId={selectedBid?.bountyId || 'review'}
                      contextUrl={
                        selectedBid?.bountyId
                          ? `/bounty/${selectedBid.bountyId}`
                          : undefined
                      }
                    />
                  )}
                </div>
                <div>
                  <Label>
                    Final Approver{' '}
                    {selectedBid?.status === 'approved' && '(Assigned)'}
                  </Label>
                  {selectedBid?.status === 'approved' ? (
                    <div className="p-2 bg-gray-100 rounded border text-gray-700">
                      {selectedReviewers[1] ||
                        selectedBid?.final_approver ||
                        'Not assigned'}
                    </div>
                  ) : (
                    <UserTagging
                      value={selectedReviewers[1] || ''}
                      onChange={(value) =>
                        setSelectedReviewers([selectedReviewers[0], value])
                      }
                      placeholder="Type @ to mention an approver..."
                      contextType="bounty"
                      contextId={selectedBid?.bountyId || 'review'}
                      contextUrl={
                        selectedBid?.bountyId
                          ? `/bounty/${selectedBid.bountyId}`
                          : undefined
                      }
                    />
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setReviewDialogOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                {(() => {
                  // Debug logging to understand the state
                  console.log('Button render state:', {
                    selectedBid: !!selectedBid,
                    selectedReviewers: selectedReviewers,
                    reviewersLength: selectedReviewers.length,
                    reviewer0: selectedReviewers[0],
                    reviewer1: selectedReviewers[1],
                    techReviewerAddress: extractAddress(selectedReviewers[0]),
                    finalApproverAddress: extractAddress(selectedReviewers[1]),
                    bounty: bounties.find(
                      (b) => b.id === selectedBid?.bountyId,
                    ),
                  });

                  // Check if we have both reviewers selected
                  const hasBothReviewers =
                    selectedReviewers.length >= 2 &&
                    selectedReviewers[0] &&
                    selectedReviewers[1];

                  if (!hasBothReviewers) {
                    return (
                      <Button
                        disabled={true}
                        style={{
                          backgroundColor: '#D8D2C8',
                          color: '#8F8A84',
                          opacity: 0.6,
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                    );
                  }

                  const techReviewerAddress = extractAddress(
                    selectedReviewers[0],
                  );
                  const finalApproverAddress = extractAddress(
                    selectedReviewers[1],
                  );

                  // Get the bounty for this bid
                  const bounty = bounties.find(
                    (b) => b.id === selectedBid?.bountyId,
                  );

                  // Check if addresses are valid and bounty exists
                  if (
                    !techReviewerAddress ||
                    !finalApproverAddress ||
                    !bounty
                  ) {
                    return (
                      <Button
                        disabled={true}
                        style={{
                          backgroundColor: '#D8D2C8',
                          color: '#8F8A84',
                          opacity: 0.6,
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        {bounty
                          ? 'Invalid reviewer addresses'
                          : 'Bounty not found'}
                      </Button>
                    );
                  }

                  // Create transaction calls
                  const contractAddress = process.env
                    .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
                  const tokenAddress =
                    bounty.value.token === 'SYSTEM'
                      ? (process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`)
                      : (process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`);

                  const paymentStructure =
                    selectedBid.paymentOption === 'milestones'
                      ? PaymentStructure.Milestones
                      : selectedBid.paymentOption === 'split'
                        ? PaymentStructure.Split
                        : PaymentStructure.Completion;

                  const upfrontAmount =
                    selectedBid.paymentDetails?.upfrontAmount || '0';
                  const completionAmount =
                    selectedBid.paymentDetails?.completionAmount ||
                    selectedBid.proposedAmount;

                  // Convert decimal amounts to BigInt using parseUnits (18 decimals for most tokens)
                  const decimals = 18; // Most ERC20 tokens use 18 decimals
                  const proposedAmountWei = parseUnits(
                    String(selectedBid.proposedAmount),
                    decimals,
                  );
                  const upfrontAmountWei = parseUnits(
                    String(upfrontAmount),
                    decimals,
                  );
                  const completionAmountWei = parseUnits(
                    String(completionAmount),
                    decimals,
                  );

                  // Create the bounty on-chain with assignment to trigger escrow
                  // TODO: In future, bounties should be created on-chain during creation, not approval
                  // For now, we create and assign in approval step to ensure escrow is set up
                  const calls: Array<{
                    address: `0x${string}`;
                    abi: readonly unknown[];
                    functionName: string;
                    args: readonly unknown[];
                  }> = [];

                  // ALWAYS include approve call for wallet-funded bounties during bid approval
                  // The bounty.funding_source field may not be set in database during bid approval,
                  // so we can't rely on it. Instead, we'll always approve when creating from bid approval.
                  // The paymaster (isSponsored={true}) will handle the approval and gas fees.
                  console.log(
                    '💰 Adding token approval call for bid approval flow',
                  );
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
                    args: [contractAddress, proposedAmountWei],
                  });

                  // Create the bounty using individual parameters as per ABI
                  // createBounty(uint128 value, address token, uint8 paymentType, string podId, string ipfsHash)

                  // Convert paymentStructure to uint8
                  let paymentType = 0; // Default: COMPLETION
                  if (paymentStructure === PaymentStructure.Milestones)
                    paymentType = 1;
                  else if (paymentStructure === PaymentStructure.Split)
                    paymentType = 2;

                  // Use the pod ID directly - it should be registered in PodBountyService
                  // If not registered, the contract will revert with "Invalid pod ID"
                  const validatedPodId = bounty.pod_id || '';

                  console.log('🏢 Pod ID for transaction:', {
                    originalPodId: bounty.pod_id,
                    validatedPodId,
                    note: 'Pod must be registered in PodBountyService contract',
                  });

                  // Create IPFS hash from bounty data (simplified for now)
                  const ipfsHash = `bounty-${bounty.id}-${Date.now()}`;

                  console.log('🔧 Transaction calls prepared:', {
                    totalCalls: 2,
                    call1:
                      'ERC20.approve() - Allow BountyManager to spend tokens',
                    call2:
                      'BountyManagerV2.createBounty() - Create bounty with escrow',
                    approveAmount: proposedAmountWei.toString(),
                    bountyAmount: proposedAmountWei.toString(),
                    tokenAddress,
                    paymentType,
                    podId: validatedPodId,
                    ipfsHash,
                    contractAddress,
                    note: 'Paymaster will handle both approve and createBounty calls',
                  });

                  calls.push({
                    address: contractAddress,
                    abi: BountyManagerABI,
                    functionName: 'createBounty',
                    args: [
                      proposedAmountWei, // uint128 value
                      tokenAddress, // address token
                      paymentType, // uint8 paymentType
                      validatedPodId, // string podId (validated with smart contract)
                      ipfsHash, // string ipfsHash
                    ],
                  });

                  // Note: assignBounty will need to be called separately after creation
                  // or we need to implement a createAndAssignBounty function in the contract

                  // Debug sponsorship config like Cart component
                  console.log('Bounty transaction sponsorship config:', {
                    isPaymasterConfigured: Boolean(
                      process.env.NEXT_PUBLIC_PAYMASTER,
                    ),
                    paymasterEndpoint:
                      process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 20) +
                      '...',
                    chainId: BASE_CHAIN_ID,
                    contracts: {
                      bountyManager:
                        process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS,
                      system: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
                      self: process.env.NEXT_PUBLIC_SELF_TOKEN,
                    },
                  });

                  // Validate transaction data
                  const transactionData = {
                    address: evmAddress?.toLowerCase() as `0x${string}`,
                    chainId: BASE_CHAIN_ID,
                    calls,
                    isSponsored: true,
                  };

                  const validation = validateTransactionData(transactionData);
                  if (!validation.isValid) {
                    console.error(
                      'Invalid transaction data:',
                      validation.issues,
                    );
                    return (
                      <Button
                        disabled={true}
                        style={{ backgroundColor: '#e8fcff', color: '#000' }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Invalid transaction data
                      </Button>
                    );
                  }

                  // CDP Smart Account transaction button
                  return evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
                    <Button
                      onClick={() => handleCreateBountyTransaction(
                        bounty,
                        selectedBid,
                        techReviewerAddress,
                        finalApproverAddress,
                        calls
                      )}
                      disabled={isCreationPending}
                      className="flex-1 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors hover:opacity-90"
                      style={{ backgroundColor: '#8FAAA1', color: '#1F2D2A' }}
                    >
                      {isCreationPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                          Creating Bounty...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Approve & Create Bounty (Gasless)
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      disabled={true}
                      style={{ backgroundColor: '#D8D2C8', color: '#8F8A84', opacity: 0.6 }}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Wallet not connected
                    </Button>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              Loading bid details...
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={rejectionDialogOpen} onOpenChange={setRejectionDialogOpen}>
        <DialogContent className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg focus:outline-none max-w-xl">
          <DialogHeader>
            <DialogTitle>Reject Bid</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this bid.
            </DialogDescription>
          </DialogHeader>

          {selectedBid && (
            <div className="space-y-6">
              {/* Bid Summary */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">
                  {getBountyTitle(selectedBid.bountyId)}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>
                    Bidder:{' '}
                    {selectedBid.first_name || selectedBid.last_name
                      ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                      : selectedBid.bidderAddress}
                  </p>
                  <p>
                    Amount: {selectedBid.proposedAmount}{' '}
                    {getTokenSymbolForBid(selectedBid.bountyId)}
                  </p>
                </div>
              </div>

              {/* Rejection Reason */}
              <div>
                <Label htmlFor="rejection-reason">Reason for Rejection</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please explain why this bid is being rejected..."
                  rows={4}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={() => setRejectionDialogOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRejectBid}
                  disabled={!rejectionReason.trim()}
                  className="flex-1"
                  style={{ backgroundColor: '#ffe8e8', color: '#000' }}
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assignment Transaction Dialog - Auto-triggered after bounty creation */}
      {pendingAssignment && (
        <Dialog
          open={true}
          onOpenChange={() => {
            // Don't allow closing while assignment is pending
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

              <div
                className="p-4 rounded-lg space-y-2 text-sm"
                style={{ backgroundColor: '#E8F1EE' }}
              >
                <p>
                  <strong>Bounty ID:</strong>{' '}
                  {pendingAssignment.onchainBountyId}
                </p>
                <p>
                  <strong>Bidder:</strong>{' '}
                  {pendingAssignment.bidderAddress.substring(0, 10)}...
                </p>
                <p>
                  <strong>Reviewer:</strong>{' '}
                  {pendingAssignment.reviewer.substring(0, 10)}...
                </p>
                <p>
                  <strong>Approver:</strong>{' '}
                  {pendingAssignment.approver.substring(0, 10)}...
                </p>
              </div>

              {/* CDP Smart Account Assignment Transaction */}
              {evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
                <Button
                  onClick={() => handleAssignBountyTransaction(pendingAssignment)}
                  disabled={isAssignmentPending}
                  className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold py-3 transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#8FAAA1', color: '#1F2D2A' }}
                >
                  {isAssignmentPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                      Assigning Bounty...
                    </>
                  ) : (
                    'Assign Bounty & Setup Escrow (Gasless)'
                  )}
                </Button>
              ) : (
                <div
                  className="w-full rounded-lg p-4"
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
      )}
    </div>
  );
};

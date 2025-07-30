"use client"

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../../components/ui/dialog';
import { Textarea } from '../../../components/ui/textarea';
import { Label } from '../../../components/ui/label';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther } from 'viem';
import BountyManagerABI from '../../../contracts/BountyManager.json';
import { format, parseISO, isValid } from 'date-fns';
import { 
  CheckCircle, 
  XCircle, 
  Eye, 
  Calendar, 
  DollarSign, 
  User,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useBountySupabase } from '../hooks/useBountySupabase';
import { type FrontendBid, type FrontendBounty, type FrontendNotification } from '../types/bounty';
import UserTagging from '../../../components/UserTagging';
import { isAddress } from 'viem';
import { PaymentStructure } from '../hooks/useBountyContractEnhanced';
import { Transaction, TransactionButton, TransactionSponsor, TransactionStatus, TransactionStatusLabel, TransactionStatusAction } from '@coinbase/onchainkit/transaction';
import { getPublicClient } from '@wagmi/core';
import { BaseError } from 'viem';

const BASE_CHAIN_ID = 8453; // Base mainnet chain ID

// Add error logging utility with rate limiting
const ERROR_LOG_KEY = 'commapp_bounty_error_logs';
const MAX_LOGS = 100; // Maximum number of logs to keep

const logError = async (error: unknown, context: string) => {
  try {
    const timestamp = new Date().toISOString();
    const errorLog = {
      timestamp,
      context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        ...(error instanceof BaseError && {
          details: error.details,
          shortMessage: error.shortMessage,
        })
      } : error
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
        })
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
    data: {} as any
  };

  try {
    // Deep clone the data to avoid modifying the original
    validation.data = JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));

    // Validate required fields
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');
    
    // Validate calls array
    if (Array.isArray(validation.data.calls)) {
      validation.data.calls.forEach((call: any, index: number) => {
        if (!call.address) validation.issues.push(`Call ${index}: Missing address`);
        if (!call.abi) validation.issues.push(`Call ${index}: Missing ABI`);
        if (!call.functionName) validation.issues.push(`Call ${index}: Missing functionName`);
        if (!Array.isArray(call.args)) validation.issues.push(`Call ${index}: Missing args array`);
      });
    } else {
      validation.issues.push('Calls is not an array');
    }

    validation.isValid = validation.issues.length === 0;
  } catch (e) {
    validation.isValid = false;
    validation.issues.push(`Serialization error: ${e instanceof Error ? e.message : String(e)}`);
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
      isValid: validatePaymasterConfig()
    }
  });
};

const simulateTransaction = async (calls: any[], publicClient: any, userAddress: string) => {
  try {
    const simulation = await publicClient.simulateContract({
      ...calls[0],
      account: userAddress,
    });
    
    console.log('Transaction simulation successful:', {
      simulation,
      calls: calls[0],
      account: userAddress
    });
    
    return true;
  } catch (error) {
    console.error('Transaction simulation failed:', {
      error,
      calls: calls[0],
      account: userAddress
    });
    return false;
  }
};

const isCoinbaseWalletError = (error: any): boolean => {
  return error?.message?.includes('scanTxTimeout') || 
         error?.message?.includes('api.wallet.coinbase.com');
};

const checkETHBalance = async (address: string, publicClient: any): Promise<boolean> => {
  try {
    const balance = await publicClient.getBalance({ address: address as `0x${string}` });
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
      publicClient.getBlockNumber()
    ]);

    console.log('Wallet State:', {
      address: userAddress,
      balance: balance.toString(),
      balanceInEth: Number(balance) / 1e18,
      blockNumber: blockNumber.toString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging wallet state:', error);
  }
};

const logNetworkConditions = async (publicClient: any) => {
  try {
    const [gasPrice, block] = await Promise.all([
      publicClient.getGasPrice(),
      publicClient.getBlock()
    ]);

    console.log('Network Conditions:', {
      gasPrice: gasPrice.toString(),
      gasPriceInGwei: Number(gasPrice) / 1e9,
      blockNumber: block.number.toString(),
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      baseFeePerGas: block.baseFeePerGas?.toString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error logging network conditions:', error);
  }
};

const logTransactionParameters = (calls: any[], isSponsored: boolean) => {
  console.log('Transaction Parameters:', {
    calls: calls.map(call => ({
      address: call.address,
      functionName: call.functionName,
      args: call.args.map((arg: any) => {
        if (typeof arg === 'bigint') {
          return {
            value: arg.toString(),
            type: 'bigint'
          };
        }
        return arg;
      })
    })),
    isSponsored,
    timestamp: new Date().toISOString()
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
      decision: hasETH && !paymasterStatus ? 'non-sponsored' :
                hasETH && paymasterStatus ? 'sponsored-with-fallback' :
                !hasETH && paymasterStatus ? 'sponsored-only' : 'cannot-proceed'
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

const handleTransactionError = async (error: Error, context: string, calls: any[], userAddress: string, publicClient: any) => {
  try {
    if (!userAddress) {
      throw new Error('No user address available');
    }

    // Log state before error handling
    await logWalletState(userAddress, publicClient);
    await logNetworkConditions(publicClient);

    const simulationSuccess = await simulateTransaction(calls, publicClient, userAddress);
    
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
        })
      },
      transactionData: {
        address: userAddress,
        chainId: BASE_CHAIN_ID,
        calls,
        ...txConfig,
        simulationSuccess,
        walletType: 'coinbase',
        timestamp: new Date().toISOString()
      }
    });

    // If it's a Coinbase Wallet error and we have a fallback available
    if (isCoinbaseError && txConfig.hasFallback) {
      console.warn('Coinbase Wallet error detected with fallback available. Retrying with non-sponsored transaction...', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
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

export const BidReviewManager: React.FC<BidReviewManagerProps> = ({ 
  onBidStatusChange,
  onNotificationSent
}) => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectionDialogOpen, setRejectionDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedBid, setSelectedBid] = useState<FrontendBid | null>(null);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const { bids, bounties, loadAllBids, loadBounties, updateBidStatus, createBidReview } = useBountySupabase();

  useEffect(() => {
    loadAllBids();
    loadBounties();
  }, [loadAllBids, loadBounties]);

  const getBountyTitle = (bountyId: string) => {
    const bounty = bounties.find(b => b.id === bountyId);
    return bounty?.title || bountyId;
  };

  const extractAddress = (mention: string | undefined): `0x${string}` | null => {
    if (!mention) return null;
    const match = mention.match(/@\[.*?\]\((0x[a-fA-F0-9]{40})\)/);
    const address = match ? match[1] : mention;
    return isAddress(address) ? address as `0x${string}` : null;
  };

  const handleReviewBid = (bid: FrontendBid) => {
    setSelectedBid(bid);
    setReviewDialogOpen(true);
  };

  const handleRejectBid = async () => {
    if (!selectedBid || !rejectionReason) return;
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
        reviewerAddress: address!,
        reviewType: 'final',
        status: 'rejected',
        comments: rejectionReason
      });
      console.log('✅ Bid review created successfully');

      // Send notification
      onNotificationSent?.({
        id: '',
        recipientAddress: selectedBid.bidderAddress,
        bountyId: selectedBid.bountyId,
        bidId: selectedBid.id,
        notificationType: 'bid_rejected',
        title: 'Bid Update',
        message: `Your bid for "${getBountyTitle(selectedBid.bountyId)}" was not selected. Reason: ${rejectionReason}`,
        isRead: false,
        createdAt: new Date()
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

  const filteredBids = bids.filter(bid => bid.status === activeTab);

  // Debug logging to see what's happening with bid statuses
  useEffect(() => {
    console.log('🔍 BidReviewManager Debug:');
    console.log('All bids:', bids);
    console.log('All bounties:', bounties);
    console.log('Active tab:', activeTab);
    console.log('Filtered bids:', filteredBids);
    console.log('Bid statuses:', bids.map(bid => ({ id: bid.id, status: bid.status, bountyId: bid.bountyId })));
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
                  <CardTitle className="text-lg truncate">{getBountyTitle(bid.bountyId)}</CardTitle>
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
                  <p>{bid.proposedAmount} tokens</p>
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
                    style={{ backgroundColor: '#e8fcff', color: '#000' }}
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
                <h3 className="font-semibold mb-2">{getBountyTitle(selectedBid.bountyId)}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>Bidder: {selectedBid.first_name || selectedBid.last_name
                    ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                    : selectedBid.bidderAddress}</p>
                  <p>Amount: {selectedBid.proposedAmount} tokens</p>
                  <p>Payment: {getPaymentOptionLabel(selectedBid.paymentOption)}</p>
                  <p>Submitted: {format(selectedBid.submittedAt, 'MMM dd, yyyy')}</p>
                </div>
              </div>

              {/* Experience */}
              <div>
                <h4 className="font-medium mb-2">Relevant Experience</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedBid.experience}</p>
                </div>
              </div>

              {/* Plan of Action */}
              <div>
                <h4 className="font-medium mb-2">Plan of Action</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedBid.planOfAction}</p>
                </div>
              </div>

              {/* Deliverables */}
              <div>
                <h4 className="font-medium mb-2">Deliverables</h4>
                <div className="space-y-2">
                  {Array.isArray(selectedBid.deliverables) && selectedBid.deliverables.length > 0 ? (
                    selectedBid.deliverables.map((deliverable, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div className="flex-grow">
                            <p className="text-gray-700">{deliverable.description}</p>
                            <div className="text-sm text-gray-600">
                              <p>Due: {(() => {
                                let dateObj = typeof deliverable.due_date === 'string'
                                  ? parseISO(deliverable.due_date)
                                  : deliverable.due_date;
                                return isValid(dateObj) ? format(dateObj, 'MMM dd, yyyy') : 'Invalid date';
                              })()}</p>
                              <p>Amount: {deliverable.payment_amount} tokens</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-500 italic">No deliverables specified</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h4 className="font-medium mb-2">Timeline</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-700 whitespace-pre-wrap">{selectedBid.timeline}</p>
                </div>
              </div>

              {/* Reviewer Assignment */}
              <div className="space-y-4">
                <div>
                  <Label>Technical Reviewer</Label>
                  <UserTagging
                    value={selectedReviewers[0] || ''}
                    onChange={(value) => setSelectedReviewers([value, selectedReviewers[1]])}
                    placeholder="Type @ to mention a reviewer..."
                    contextType="bounty"
                    contextId={selectedBid?.bountyId || 'review'}
                    contextUrl={selectedBid?.bountyId ? `/bounty/${selectedBid.bountyId}` : undefined}
                  />
                </div>
                <div>
                  <Label>Final Approver</Label>
                  <UserTagging
                    value={selectedReviewers[1] || ''}
                    onChange={(value) => setSelectedReviewers([selectedReviewers[0], value])}
                    placeholder="Type @ to mention an approver..."
                    contextType="bounty"
                    contextId={selectedBid?.bountyId || 'review'}
                    contextUrl={selectedBid?.bountyId ? `/bounty/${selectedBid.bountyId}` : undefined}
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setReviewDialogOpen(false)} variant="outline">
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
                    bounty: bounties.find(b => b.id === selectedBid?.bountyId)
                  });

                  // Check if we have both reviewers selected
                  const hasBothReviewers = selectedReviewers.length >= 2 && 
                    selectedReviewers[0] && selectedReviewers[1];
                  
                  if (!hasBothReviewers) {
                    return (
                      <Button
                        disabled
                        style={{ backgroundColor: '#e8fcff', color: '#000' }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                    );
                  }

                  const techReviewerAddress = extractAddress(selectedReviewers[0]);
                  const finalApproverAddress = extractAddress(selectedReviewers[1]);
                  
                  // Get the bounty for this bid
                  const bounty = bounties.find(b => b.id === selectedBid?.bountyId);
                  
                  // Check if addresses are valid and bounty exists
                  if (!techReviewerAddress || !finalApproverAddress || !bounty) {
                    return (
                      <Button
                        disabled
                        style={{ backgroundColor: '#e8fcff', color: '#000' }}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        {!bounty ? 'Bounty not found' : 'Invalid reviewer addresses'}
                      </Button>
                    );
                  }

                  // Create transaction calls
                  const contractAddress = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}`;
                  const tokenAddress = bounty.value.token === 'SYSTEM' 
                    ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN as `0x${string}`
                    : process.env.NEXT_PUBLIC_SELF_TOKEN as `0x${string}`;

                  const paymentStructure =
                    selectedBid.paymentOption === 'milestones' ? PaymentStructure.Milestones :
                    selectedBid.paymentOption === 'split' ? PaymentStructure.Split :
                    PaymentStructure.Completion;
                  
                  const upfrontAmount = selectedBid.paymentDetails?.upfrontAmount || '0';
                  const completionAmount = selectedBid.paymentDetails?.completionAmount || selectedBid.proposedAmount;

                  const calls = [{
                    address: contractAddress,
                    abi: BountyManagerABI,
                    functionName: 'createBounty',
                    args: [
                      bounty.title,
                      bounty.category,
                      String(selectedBid.proposedAmount),
                      tokenAddress,
                      paymentStructure,
                      String(upfrontAmount),
                      String(completionAmount),
                    ],
                  }];

                  // Debug sponsorship config like Cart component
                  console.log("Bounty transaction sponsorship config:", {
                    isPaymasterConfigured: Boolean(process.env.NEXT_PUBLIC_PAYMASTER),
                    paymasterEndpoint: process.env.NEXT_PUBLIC_PAYMASTER?.substring(0, 20) + "...",
                    chainId: BASE_CHAIN_ID,
                    contracts: {
                      bountyManager: process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS,
                      system: process.env.NEXT_PUBLIC_SYSTEM_TOKEN,
                      self: process.env.NEXT_PUBLIC_SELF_TOKEN,
                    },
                  });

                  // Validate transaction data
                  const transactionData = {
                    address: address?.toLowerCase() as `0x${string}`,
                    chainId: BASE_CHAIN_ID,
                    calls,
                    isSponsored: true
                  };

                  const validation = validateTransactionData(transactionData);
                  if (!validation.isValid) {
                    console.error('Invalid transaction data:', validation.issues);
                    return (
                      <Button disabled style={{ backgroundColor: '#e8fcff', color: '#000' }}>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Invalid transaction data
                      </Button>
                    );
                  }

                  // Dynamic sponsorship component
                  const DynamicTransaction = () => {
                    const [isLoading, setIsLoading] = useState(true);
                    const [txConfig, setTxConfig] = useState<{ isSponsored: boolean; hasFallback: boolean } | null>(null);

                    useEffect(() => {
                      const loadTransactionConfig = async () => {
                        try {
                          if (address) {
                            // Always use sponsored transactions when paymaster is configured
                            const config = { isSponsored: true, hasFallback: false };
                            console.log('Transaction config loaded:', config);
                            setTxConfig(config);
                          }
                        } catch (error) {
                          console.error('Error loading transaction config:', error);
                          setTxConfig(null);
                        } finally {
                          setIsLoading(false);
                        }
                      };

                      loadTransactionConfig();
                    }, [address, publicClient]);

                    if (isLoading) {
                      return (
                        <Button disabled style={{ backgroundColor: '#e8fcff', color: '#000' }}>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Loading transaction config...
                        </Button>
                      );
                    }

                    if (!txConfig) {
                      return (
                        <Button disabled style={{ backgroundColor: '#e8fcff', color: '#000' }}>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Failed to load transaction config
                        </Button>
                      );
                    }

                    console.log('Using transaction config:', txConfig);

                    return (
                      <Transaction
                        address={address?.toLowerCase() as `0x${string}`}
                        chainId={BASE_CHAIN_ID}
                        calls={calls}
                        isSponsored={true}
                        onSuccess={async () => {
                          console.log('Bounty creation transaction succeeded');
                          logTransactionLifecycle('Success', {
                            type: 'bounty_creation',
                            address: address?.toLowerCase(),
                            chainId: BASE_CHAIN_ID,
                            sponsorshipUsed: true
                          });
                          
                          // Update status in Supabase
                          await updateBidStatus(selectedBid.id, 'approved', techReviewerAddress, finalApproverAddress);
                          onBidStatusChange?.();

                          // Send notifications
                          onNotificationSent?.({
                            id: '',
                            recipientAddress: selectedBid.bidderAddress,
                            bountyId: selectedBid.bountyId,
                            bidId: selectedBid.id,
                            notificationType: 'bid_approved',
                            title: 'Bid Approved!',
                            message: `Your bid for "${getBountyTitle(selectedBid.bountyId)}" has been approved.`,
                            isRead: false,
                            createdAt: new Date()
                          });

                          onNotificationSent?.({
                            id: '',
                            recipientAddress: techReviewerAddress,
                            bountyId: selectedBid.bountyId,
                            bidId: selectedBid.id,
                            notificationType: 'review_requested',
                            title: 'Review Assignment',
                            message: `You have been assigned as Technical Reviewer for "${getBountyTitle(selectedBid.bountyId)}".`,
                            isRead: false,
                            createdAt: new Date()
                          });
                          
                          onNotificationSent?.({
                            id: '',
                            recipientAddress: finalApproverAddress,
                            bountyId: selectedBid.bountyId,
                            bidId: selectedBid.id,
                            notificationType: 'review_requested',
                            title: 'Review Assignment',
                            message: `You have been assigned as Final Approver for "${getBountyTitle(selectedBid.bountyId)}".`,
                            isRead: false,
                            createdAt: new Date()
                          });

                          setReviewDialogOpen(false);
                          setSelectedBid(null);
                          setSelectedReviewers([]);
                          await loadAllBids();
                        }}
                        onError={async (error: Error) => {
                          console.error('Bounty creation transaction failed:', error);
                          
                          // Handle transaction error with fallback logic
                          const errorResult = await handleTransactionError(
                            error, 
                            'bounty_creation', 
                            calls, 
                            address?.toLowerCase() || '',
                            publicClient
                          );
                          
                          if (errorResult.shouldRetry) {
                            console.log('Retrying transaction with non-sponsored configuration...');
                            // Here we would implement the retry logic with the new config
                            // For now, just show an error message
                            alert(`Transaction failed but retry is available. Error: ${error.message}`);
                          } else {
                            alert(`Failed to create bounty: ${error.message}`);
                          }
                        }}
                      >
                        <TransactionButton
                          text="Approve & Create Bounty (Sponsored)"
                          className="flex-1"
                          style={{ backgroundColor: '#e8fcff', color: '#000' }}
                        />
                        <TransactionSponsor />
                        <TransactionStatus>
                          <TransactionStatusLabel />
                          <TransactionStatusAction />
                        </TransactionStatus>
                        {/* DEBUG BUTTON: Should always show */}
                        <Button style={{ background: 'red', color: '#fff', width: '100%' }}>
                          DEBUG: Should always show
                        </Button>
                      </Transaction>
                    );
                  };

                  return <DynamicTransaction />;
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
                <h3 className="font-semibold mb-2">{getBountyTitle(selectedBid.bountyId)}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                  <p>Bidder: {selectedBid.first_name || selectedBid.last_name
                    ? `${selectedBid.first_name || ''} ${selectedBid.last_name || ''}`.trim()
                    : selectedBid.bidderAddress}</p>
                  <p>Amount: {selectedBid.proposedAmount} tokens</p>
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
    </div>
  );
}; 
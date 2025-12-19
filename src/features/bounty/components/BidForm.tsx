'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CalendarIcon, Plus, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { Loader2 } from 'lucide-react';
import BountyManagerABIJson from '@/abis/BountyManagerV2.json';
import { uploadBidToIPFS, type BidMetadata } from '../services/bidIpfsService';
import type { Abi, TransactionReceipt } from 'viem';

const BountyManagerABI = BountyManagerABIJson as Abi;

interface Deliverable {
  id: string;
  description: string;
  dueDate: Date;
  paymentAmount: string;
}

interface BountyDetails {
  id: string;
  onchain_id?: number; // Required for on-chain bid placement
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  requirements?: string[];
  questions?: string[];
}

interface BidFormData {
  experience: string;
  planOfAction: string;
  deliverables: Deliverable[];
  timeline: string;
  proposedAmount: string;
  paymentOption: 'completion' | 'milestones' | 'split';
  paymentDetails: {
    upfrontAmount?: string;
    completionAmount?: string;
    milestonePayments?: { [key: string]: string };
  };
  additionalNotes: string;
  answers: Record<string, string>;
}

interface BidFormProps {
  bounty: BountyDetails;
  onBidPlaced: (
    bidData: BidFormData,
    ipfsHash: string,
    transactionHash: string,
    bidIndex: number,
  ) => void;
  onCancel: () => void;
  initialData?: Partial<BidFormData>; // Optional initial data for editing
  isEditing?: boolean; // Flag to indicate editing mode
}

export const BidForm: React.FC<BidFormProps> = ({
  bounty,
  onBidPlaced,
  onCancel,
  initialData,
  isEditing = false,
}) => {
  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();
  const publicClient = usePublicClient();
  const [formData, setFormData] = useState<BidFormData>({
    experience: initialData?.experience || '',
    planOfAction: initialData?.planOfAction || '',
    deliverables: initialData?.deliverables || [
      {
        id: Math.random().toString(36).substr(2, 9),
        description: '',
        dueDate: new Date(),
        paymentAmount: '0',
      },
    ],
    timeline: initialData?.timeline || '',
    proposedAmount: initialData?.proposedAmount || bounty.value.amount,
    paymentOption: initialData?.paymentOption || 'completion',
    paymentDetails: initialData?.paymentDetails || {},
    additionalNotes: initialData?.additionalNotes || '',
    answers: initialData?.answers || {},
  });

  const [showCalendar, setShowCalendar] = useState<string | null>(null);
  const [ipfsHash, setIpfsHash] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [transactionHash, setTransactionHash] = useState<string>('');
  const [isProcessingTransaction, setIsProcessingTransaction] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false);
  const [hasCallbackFired, setHasCallbackFired] = useState(false);

  // Debug logging for button state
  React.useEffect(() => {
    console.log('🎯 BidForm button state:', {
      bountyId: bounty.id,
      onchain_id: bounty.onchain_id,
      hasOnchainId: !!bounty.onchain_id,
      walletAddress: evmAddress,
      hasWallet: !!evmAddress,
      isUploading,
      ipfsHash,
      buttonDisabled: isUploading || !bounty.onchain_id || !evmAddress,
    });
  }, [bounty.onchain_id, evmAddress, isUploading, ipfsHash]);

  // Fallback transaction monitoring - Poll for receipt if callback doesn't fire within 30 seconds
  React.useEffect(() => {
    if (
      !isProcessingTransaction ||
      hasCallbackFired ||
      !transactionHash ||
      !publicClient
    ) {
      return;
    }

    console.log(
      '⏱️ Starting fallback transaction monitoring for:',
      transactionHash,
    );

    const pollInterval = setInterval(async () => {
      try {
        console.log('🔍 Polling for transaction receipt:', transactionHash);

        const receipt = await publicClient.getTransactionReceipt({
          hash: transactionHash as `0x${string}`,
        });

        if (receipt && receipt.status === 'success') {
          console.log('✅ Fallback: Transaction receipt found!', receipt);

          // Clear the interval
          clearInterval(pollInterval);

          if (hasCallbackFired) {
            console.log(
              '⚠️ Callback already fired, skipping fallback processing',
            );
            return;
          }

          // Extract BidPlaced event
          const bidPlacedLog = receipt.logs?.find(
            (log: any) =>
              log.topics &&
              log.topics.length >= 3 &&
              log.address?.toLowerCase() ===
                (
                  process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
                  '0x29e653502083442B8B6C7c969557022F6a3CC64C'
                ).toLowerCase(),
          );

          if (bidPlacedLog) {
            const bidIndex = parseInt(bidPlacedLog.data, 16);

            console.log('✅ Fallback: Bid placed on-chain:', {
              bountyId: bounty.onchain_id,
              bidIndex,
              txHash: receipt.transactionHash,
              ipfsHash,
            });

            setHasCallbackFired(true);

            const mappedDeliverables = formData.deliverables.map((d) => ({
              id: d.id,
              description: d.description,
              dueDate:
                d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate),
              paymentAmount: d.paymentAmount,
            }));

            console.log('🚀 Fallback: Calling onBidPlaced callback');

            onBidPlaced(
              {
                ...formData,
                deliverables: mappedDeliverables,
              },
              ipfsHash,
              receipt.transactionHash,
              bidIndex,
            );

            setIsProcessingTransaction(false);
          }
        }
      } catch (error) {
        console.error('❌ Error polling for transaction receipt:', error);
      }
    }, 3000); // Poll every 3 seconds

    // Clear interval after 60 seconds
    const timeout = setTimeout(() => {
      console.log('⏱️ Fallback transaction monitoring timed out');
      clearInterval(pollInterval);
      if (!hasCallbackFired) {
        setUploadError(
          'Transaction monitoring timed out. Please refresh the page to check if your bid was placed.',
        );
        setIsProcessingTransaction(false);
      }
    }, 60000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [
    isProcessingTransaction,
    hasCallbackFired,
    transactionHash,
    publicClient,
    ipfsHash,
    bounty.onchain_id,
    formData,
    onBidPlaced,
  ]);

  // Step 1: Prepare bid and upload to IPFS
  const handlePrepareSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('🔍 Prepare Bid button clicked');

    if (!evmAddress) {
      console.error('❌ No wallet connected');
      setUploadError('Please connect your wallet first');
      return;
    }

    if (!bounty.onchain_id) {
      console.error('❌ Bounty not on-chain:', bounty.id);
      setUploadError(
        'This bounty is not yet on-chain. Please wait for the bounty creator to finalize it.',
      );
      return;
    }

    // Validate required fields
    if (!formData.experience.trim()) {
      setUploadError('Please describe your relevant experience');
      return;
    }

    if (!formData.planOfAction.trim()) {
      setUploadError('Please provide your plan of action');
      return;
    }

    if (!formData.timeline.trim()) {
      setUploadError('Please provide your timeline');
      return;
    }

    if (
      !formData.proposedAmount ||
      Number.parseFloat(formData.proposedAmount) <= 0
    ) {
      setUploadError('Please enter a valid proposed amount');
      return;
    }

    // Validate deliverables
    if (formData.deliverables.length === 0) {
      setUploadError('Please add at least one deliverable');
      return;
    }

    for (const deliverable of formData.deliverables) {
      if (!deliverable.description.trim()) {
        setUploadError('All deliverables must have a description');
        return;
      }
    }

    // Validate bounty-specific questions
    if (bounty.questions && bounty.questions.length > 0) {
      for (const question of bounty.questions) {
        if (!formData.answers[question]?.trim()) {
          setUploadError(`Please answer: ${question}`);
          return;
        }
      }
    }

    try {
      setIsUploading(true);
      setUploadError('');

      // Prepare metadata for IPFS
      const metadata: BidMetadata = {
        experience: formData.experience,
        planOfAction: formData.planOfAction,
        deliverables: formData.deliverables.map((d) => ({
          description: d.description,
          due_date:
            d.dueDate instanceof Date ? d.dueDate.toISOString() : d.dueDate,
          payment_amount: d.paymentAmount,
        })),
        timeline: formData.timeline,
        proposedAmount: formData.proposedAmount,
        paymentOption: formData.paymentOption,
        paymentDetails: formData.paymentDetails,
        additionalNotes: formData.additionalNotes,
        answers: formData.answers,
        bidder_address: evmAddress,
        bounty_id: bounty.id,
        timestamp: Date.now(),
      };

      console.log('📤 Uploading bid to IPFS...', {
        bounty_id: bounty.id,
        bidder: evmAddress,
      });
      const hash = await uploadBidToIPFS(metadata);
      setIpfsHash(hash);
      console.log('✅ Bid uploaded to IPFS:', hash);
    } catch (error) {
      console.error('❌ Failed to upload bid:', error);
      setUploadError(
        error instanceof Error
          ? error.message
          : 'Failed to prepare bid. Please try again.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  // Step 2: Submit bid on-chain via CDP Smart Account
  const handleSubmitBidTransaction = async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for bid submission:', {
        hasAddress: !!evmAddress,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      setUploadError('Smart Wallet not properly configured');
      return;
    }

    if (!ipfsHash) {
      setUploadError('Please prepare your bid first');
      return;
    }

    if (!bounty.onchain_id) {
      setUploadError('Bounty not yet on-chain');
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN
    setIsProcessingTransaction(true);
    setUploadError('');

    try {
      console.log('🚀 Building Smart Account User Operation for bid submission...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Contract: BountyManager - placeBid');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      const contractAddress = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
        '0x29e653502083442B8B6C7c969557022F6a3CC64C') as `0x${string}`;

      // EXACT FAUCET PATTERN: Encode call data
      const callData = encodeFunctionData({
        abi: BountyManagerABI,
        functionName: 'placeBid',
        args: [BigInt(bounty.onchain_id!), ipfsHash],
      });

      console.log('📝 Encoded call data for placeBid');

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
        const receipt = resultWithReceipt.receipt as TransactionReceipt;
        setTransactionHash(receipt.transactionHash);

        // Extract BidPlaced event
        // Event: BidPlaced(uint256 indexed bountyId, address indexed bidder, uint256 bidIndex)
        const bidPlacedLog = receipt.logs?.find(
          (log: any) =>
            log.topics &&
            log.topics.length >= 3 &&
            log.address?.toLowerCase() === contractAddress.toLowerCase(),
        );

        console.log('🔍 BidPlaced event search:', {
          totalLogs: receipt.logs?.length || 0,
          bidPlacedLogFound: !!bidPlacedLog,
        });

        if (bidPlacedLog) {
          // bidIndex is NOT indexed, so it's in the data field
          const bidIndex = parseInt(bidPlacedLog.data, 16);

          console.log('✅ Bid placed on-chain:', {
            bountyId: bounty.onchain_id,
            bidIndex,
            txHash: receipt.transactionHash,
            ipfsHash,
          });

          // Mark callback as fired to prevent duplicates
          setHasCallbackFired(true);

          // Map deliverables to correct format
          const mappedDeliverables = formData.deliverables.map((d) => ({
            id: d.id,
            description: d.description,
            dueDate: d.dueDate instanceof Date ? d.dueDate : new Date(d.dueDate),
            paymentAmount: d.paymentAmount,
          }));

          console.log('🚀 Calling onBidPlaced callback with data:', {
            txHash: receipt.transactionHash,
            bidIndex,
            ipfsHash,
            bountyId: bounty.id,
          });

          // Callback with bid placement details
          onBidPlaced(
            {
              ...formData,
              deliverables: mappedDeliverables,
            },
            ipfsHash,
            receipt.transactionHash,
            bidIndex,
          );

          setIsProcessingTransaction(false);
        } else {
          console.error('❌ Could not extract bid index from transaction logs');
          console.error('Receipt logs:', receipt.logs);
          setUploadError('Bid was placed but could not extract bid index. Please contact support.');
          setIsProcessingTransaction(false);
        }
      } else {
        console.warn('⚠️ No receipt found in result');
        setUploadError('Transaction completed but no receipt found');
      }
    } catch (err: any) {
      console.error('❌ Bid submission failed:', err);
      setUploadError(err.message || 'Transaction failed. Please try again.');
      setIsProcessingTransaction(false);
      setHasCallbackFired(false);
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  };

  const handleQuestionAnswer = (question: string, answer: string) => {
    setFormData((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [question]: answer,
      },
    }));
  };

  const addDeliverable = () => {
    const newDeliverable: Deliverable = {
      id: Math.random().toString(36).substr(2, 9),
      description: '',
      dueDate: new Date(),
      paymentAmount: '0',
    };
    setFormData((prev) => ({
      ...prev,
      deliverables: [...prev.deliverables, newDeliverable],
    }));
  };

  const updateDeliverable = (
    id: string,
    field: keyof Deliverable,
    value: any,
  ) => {
    setFormData((prev) => ({
      ...prev,
      deliverables: prev.deliverables.map((d) =>
        d.id === id ? { ...d, [field]: value } : d,
      ),
    }));
  };

  const removeDeliverable = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      deliverables: prev.deliverables.filter((d) => d.id !== id),
    }));
  };

  const handlePaymentOptionChange = (
    option: 'completion' | 'milestones' | 'split',
  ) => {
    setFormData((prev) => ({
      ...prev,
      paymentOption: option,
      paymentDetails:
        option === 'split'
          ? {
              upfrontAmount: '0',
              completionAmount: String(prev.proposedAmount),
            }
          : {},
    }));
  };

  const calculateMilestonePayments = () => {
    if (
      formData.paymentOption === 'milestones' &&
      formData.deliverables.length > 0
    ) {
      const totalAmount = Number.parseFloat(formData.proposedAmount);
      const perMilestone = (totalAmount / formData.deliverables.length).toFixed(
        2,
      );

      const milestonePayments: { [key: string]: string } = {};
      formData.deliverables.forEach((d) => {
        milestonePayments[d.id] = perMilestone;
      });

      setFormData((prev) => ({
        ...prev,
        paymentDetails: { milestonePayments },
      }));
    }
  };

  React.useEffect(() => {
    calculateMilestonePayments();
  }, [formData.deliverables.length, formData.paymentOption]);

  return (
    <Card className="w-full max-w-4xl mx-auto bounty-card">
      <CardHeader className="bounty-header">
        <CardTitle className="text-2xl font-bold bounty-title">
          {bounty.title}
        </CardTitle>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="bounty-category">
            {bounty.category}
          </Badge>
          <Badge variant="secondary" className="bounty-value">
            {bounty.value.amount} {bounty.value.token}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="bounty-content">
        <form
          onSubmit={handlePrepareSubmission}
          className="space-y-6 bounty-form"
        >
          {/* Bounty Summary */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold mb-2">Bounty Details</h3>
            <p className="text-gray-600 mb-2 bounty-description">
              {bounty.description}
            </p>
            {bounty.requirements && bounty.requirements.length > 0 && (
              <div className="mt-2">
                <h4 className="font-medium text-sm">Requirements:</h4>
                <ul className="list-disc list-inside text-sm text-gray-600">
                  {Array.isArray(bounty.requirements) &&
                    bounty.requirements.map((req, index) => (
                      <li key={index}>{req}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>

          {/* Experience */}
          <div className="space-y-2 form-group">
            <Label htmlFor="experience" className="form-label">
              Relevant Experience *
            </Label>
            <Textarea
              id="experience"
              value={formData.experience}
              onChange={(e) =>
                setFormData({ ...formData, experience: e.target.value })
              }
              placeholder="Describe your relevant experience for this bounty..."
              className="form-textarea"
              rows={4}
            />
          </div>

          {/* Plan of Action */}
          <div className="space-y-2 form-group">
            <Label htmlFor="planOfAction" className="form-label">
              Plan of Action *
            </Label>
            <Textarea
              id="planOfAction"
              value={formData.planOfAction}
              onChange={(e) =>
                setFormData({ ...formData, planOfAction: e.target.value })
              }
              placeholder="Outline your approach to completing this bounty..."
              className="form-textarea"
              rows={4}
            />
          </div>

          {/* Deliverables with Dates */}
          <div className="space-y-4 form-group">
            <div className="flex justify-between items-center">
              <Label className="form-label inline-block mb-0">
                Deliverables *
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDeliverable}
                style={{ color: '#3F7A5A' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#2F5D50';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#3F7A5A';
                }}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {formData.deliverables.map((deliverable, index) => (
              <div
                key={deliverable.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex justify-between items-start">
                  <h4 className="font-medium">Deliverable {index + 1}</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeDeliverable(deliverable.id)}
                    style={{ color: '#8B3A3A' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#5C1F1F';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#8B3A3A';
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Description *</Label>
                  <Textarea
                    value={deliverable.description}
                    onChange={(e) =>
                      updateDeliverable(
                        deliverable.id,
                        'description',
                        e.target.value,
                      )
                    }
                    placeholder="Describe this deliverable..."
                    className="form-textarea"
                    rows={2}
                  />
                </div>

                <div className="flex flex-col gap-4 md:flex-row md:gap-4">
                  <div className="space-y-2 w-full md:w-1/2">
                    <Label className="text-sm">Due Date</Label>
                    <Popover
                      open={showCalendar === deliverable.id}
                      onOpenChange={(open) =>
                        setShowCalendar(open ? deliverable.id : null)
                      }
                    >
                      <PopoverTrigger asChild={true}>
                        <Button
                          variant="outline"
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !deliverable.dueDate && 'text-muted-foreground',
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {deliverable.dueDate
                            ? format(deliverable.dueDate, 'PPP')
                            : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 bg-white shadow-lg mx-auto flex justify-center">
                        <Calendar
                          mode="single"
                          selected={deliverable.dueDate}
                          onSelect={(date) => {
                            updateDeliverable(deliverable.id, 'dueDate', date);
                            setShowCalendar(null);
                          }}
                          initialFocus={true}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2 w-full md:w-1/2">
                    <Label className="text-sm">
                      Payment ${bounty.value.token}
                    </Label>
                    <Input
                      type="number"
                      value={deliverable.paymentAmount}
                      onChange={(e) =>
                        updateDeliverable(
                          deliverable.id,
                          'paymentAmount',
                          e.target.value,
                        )
                      }
                      placeholder="0"
                      className="form-input"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="space-y-2 form-group">
            <Label htmlFor="timeline" className="form-label">
              Overall Timeline *
            </Label>
            <Textarea
              id="timeline"
              value={formData.timeline}
              onChange={(e) =>
                setFormData({ ...formData, timeline: e.target.value })
              }
              placeholder="Provide your estimated timeline with key milestones..."
              className="form-textarea"
              rows={3}
            />
          </div>

          {/* Payment Options */}
          <div className="space-y-4 form-group">
            <Label className="form-label">Payment Structure</Label>
            <Select
              value={formData.paymentOption}
              onValueChange={handlePaymentOptionChange}
            >
              <SelectTrigger className="form-select bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="completion">Pay on Completion</SelectItem>
                <SelectItem value="milestones">Pay per Milestone</SelectItem>
                <SelectItem value="split">
                  Split Payment (Upfront + Completion)
                </SelectItem>
              </SelectContent>
            </Select>

            {formData.paymentOption === 'split' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">
                    Upfront Amount ({bounty.value.token})
                  </Label>
                  <Input
                    type="number"
                    value={formData.paymentDetails.upfrontAmount || '0'}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        paymentDetails: {
                          ...prev.paymentDetails,
                          upfrontAmount: e.target.value,
                          completionAmount: (
                            Number.parseFloat(prev.proposedAmount) -
                            Number.parseFloat(e.target.value || '0')
                          ).toString(),
                        },
                      }))
                    }
                    className="form-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Completion Amount ({bounty.value.token})
                  </Label>
                  <Input
                    type="number"
                    value={
                      formData.paymentDetails.completionAmount ||
                      formData.proposedAmount
                    }
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        paymentDetails: {
                          ...prev.paymentDetails,
                          completionAmount: e.target.value,
                          upfrontAmount: (
                            Number.parseFloat(prev.proposedAmount) -
                            Number.parseFloat(e.target.value || '0')
                          ).toString(),
                        },
                      }))
                    }
                    className="form-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Proposed Amount */}
          <div className="space-y-2 form-group">
            <Label htmlFor="proposedAmount" className="form-label">
              Total Proposed Amount ({bounty.value.token}) *
            </Label>
            <Input
              id="proposedAmount"
              type="number"
              value={formData.proposedAmount}
              onChange={(e) =>
                setFormData({ ...formData, proposedAmount: e.target.value })
              }
              placeholder={bounty.value.amount}
              className="form-input"
            />
            <p className="text-sm text-gray-500">
              Original bounty amount: {bounty.value.amount} {bounty.value.token}
            </p>
          </div>

          {/* Dynamic Questions from Bounty Creator */}
          {bounty.questions && bounty.questions.length > 0 && (
            <div className="space-y-4 form-group">
              <h3 className="font-semibold">Additional Questions</h3>
              {Array.isArray(bounty.questions) &&
                bounty.questions.map((question, index) => (
                  <div key={index} className="space-y-2">
                    <Label htmlFor={`question-${index}`} className="form-label">
                      {question} *
                    </Label>
                    <Textarea
                      id={`question-${index}`}
                      value={formData.answers[question] || ''}
                      onChange={(e) =>
                        handleQuestionAnswer(question, e.target.value)
                      }
                      placeholder="Your answer..."
                      className="form-textarea"
                      rows={2}
                    />
                  </div>
                ))}
            </div>
          )}

          {/* Additional Notes */}
          <div className="space-y-2 form-group">
            <Label htmlFor="additionalNotes" className="form-label">
              Additional Notes
            </Label>
            <Textarea
              id="additionalNotes"
              value={formData.additionalNotes}
              onChange={(e) =>
                setFormData({ ...formData, additionalNotes: e.target.value })
              }
              placeholder="Any additional information you'd like to share..."
              className="form-textarea"
              rows={3}
            />
          </div>

          {/* Error Display */}
          {uploadError && (
            <div
              className="px-4 py-3 rounded"
              style={{
                backgroundColor: '#F5E6E6',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#D9B3B3',
                color: '#5C1F1F',
              }}
            >
              <p className="font-medium">Error:</p>
              <p>{uploadError}</p>
            </div>
          )}

          {/* Bounty not on-chain warning */}
          {!bounty.onchain_id && (
            <div
              className="px-4 py-3 rounded"
              style={{
                backgroundColor: '#FAF4EC',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#E8D7B8',
                color: '#8F6B2F',
              }}
            >
              <p className="font-medium">⚠️ Bounty Not Yet On-Chain</p>
              <p className="text-sm mt-1">
                This bounty needs to be finalized on-chain before you can submit
                a bid. Please wait for the bounty creator to complete this step.
              </p>
              <p className="text-xs mt-2 text-gray-600">
                Bounty ID: {bounty.id}
                <br />
                On-Chain ID: {bounty.onchain_id || 'Not set'}
              </p>
            </div>
          )}

          {/* Wallet not connected warning */}
          {!evmAddress && (
            <div
              className="px-4 py-3 rounded"
              style={{
                backgroundColor: '#F5E6E6',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#D9B3B3',
                color: '#5C1F1F',
              }}
            >
              <p className="font-medium">❌ Wallet Not Connected</p>
              <p className="text-sm mt-1">
                Please connect your wallet to submit a bid.
              </p>
            </div>
          )}

          {/* Form Actions - Two-Step Flow */}
          <div className="flex gap-4 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1 bounty-btn secondary"
            >
              Cancel
            </Button>

            {!ipfsHash ? (
              /* Step 1: Prepare Bid (Upload to IPFS) */
              <Button
                type="submit"
                disabled={isUploading || !bounty.onchain_id || !evmAddress}
                className="flex-1 bounty-btn primary"
                style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
              >
                {isUploading ? '📤 Preparing Bid...' : '📝 Prepare Bid'}
              </Button>
            ) : (
              /* Step 2: Submit Bid On-Chain via CDP Smart Account */
              evmAddress && currentUser?.evmSmartAccounts?.[0] ? (
                <Button
                  onClick={handleSubmitBidTransaction}
                  disabled={isTransactionPending || isProcessingTransaction}
                  className="flex-1 disabled:bg-gray-400 disabled:cursor-not-allowed font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: '#2F5D50', color: '#FFFFFF' }}
                >
                  {isTransactionPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                      Submitting Bid...
                    </>
                  ) : isProcessingTransaction ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin inline" />
                      Processing...
                    </>
                  ) : (
                    '🚀 Submit Bid (Gasless)'
                  )}
                </Button>
              ) : (
                <div
                  className="flex-1 px-4 py-3 rounded"
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
              )
            )}
          </div>

          {/* IPFS Upload Success Message */}
          {ipfsHash && (
            <div
              className="px-4 py-3 rounded"
              style={{
                backgroundColor: '#D1E6DC',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#B8D9CA',
                color: '#1F453A',
              }}
            >
              <p className="font-medium">✅ Bid Prepared Successfully!</p>
              <p className="text-sm mt-1">
                Your bid has been uploaded to IPFS. Click "Submit Bid" above to
                place it on-chain.
              </p>
              <p className="text-xs mt-1 text-gray-600 break-all">
                IPFS Hash: {ipfsHash}
              </p>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
};

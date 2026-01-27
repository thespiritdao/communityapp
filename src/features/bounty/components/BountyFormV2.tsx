'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { parseEther, encodeFunctionData, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBountyV2 } from '../hooks/useBountyV2';
// import { usePodFactoryPermissions } from '@/features/pods/hooks/usePodFactoryPermissions'; // OLD: On-chain factory check
import { useBountyPermissions } from '@/features/bounty/hooks/useBountyPermissions'; // NEW: Database permission check
import { useBountyManagementAccess } from '../hooks/useBountyManagementAccess';
import { BountyTreasuryFundingTransaction } from './BountyTreasuryFundingTransaction';
import { RegisterPodButton } from '@/features/pods/components/RegisterPodButton';

export interface BountyFormV2Data {
  title: string;
  description: string;
  category: string;
  value: {
    amount: string;
    token: 'SYSTEM' | 'SELF';
  };
  deadline?: string;
  requirements: string[];
  tasks: string[];
  questions: string[];
  work_requirements: string[];
  funding_source: 'wallet' | 'pod_treasury';
  podId: string;
  // Bid acceptance configuration
  bid_acceptance_mode?: 'single' | 'multiple' | 'unlimited' | 'date_limited';
  max_bids_accepted?: number;
  bids_accepted_count?: number;
}

interface BountyFormV2Props {
  onSuccess?: (bountyId: string) => void;
  onCancel?: () => void;
  categories: string[];
}

export const BountyFormV2: React.FC<BountyFormV2Props> = ({
  onSuccess,
  onCancel,
  categories,
}) => {
  const router = useRouter();

  // CDP Smart Account hooks - EXACT FAUCET PATTERN
  const { evmAddress } = useEvmAddress();
  const { sendUserOperation } = useSendUserOperation();
  const { currentUser } = useCurrentUser();

  const { createBountyCall } = useBountyV2();
  const { managedPods: managablePods, isLoading: podsLoading } =
    useBountyManagementAccess();

  const [formData, setFormData] = useState<BountyFormV2Data>({
    title: '',
    description: '',
    category: '',
    value: { amount: '', token: 'SYSTEM' },
    deadline: '',
    requirements: [''],
    tasks: [''],
    questions: [''],
    work_requirements: [''],
    funding_source: 'wallet',
    podId: '',
    // Bid limit defaults
    bid_acceptance_mode: 'single',
    max_bids_accepted: 1,
    bids_accepted_count: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ipfsHash, setIpfsHash] = useState<string>('');
  const [createdBountyId, setCreatedBountyId] = useState<number | null>(null);
  const [showTreasuryFunding, setShowTreasuryFunding] = useState(false);
  const [isTransactionPending, setIsTransactionPending] = useState(false); // CDP transaction loading state
  const [transactionStatus, setTransactionStatus] = useState<string>(''); // Status message for user
  const hasSetInitialPod = useRef(false);
  const savedTransactions = useRef(new Set<string>()); // Track saved transactions to prevent duplicates

  // Get permissions for selected pod (only when podId is valid)
  // FIXED: Use database permissions (respects pod manage page toggles) instead of on-chain factory
  const { canManageBounties, canUseTreasury } = useBountyPermissions(
    formData.podId && formData.podId.trim() !== '' ? formData.podId : null,
  );

  // Precompute form validity without setting state (prevents infinite re-renders)
  const isFormValid = useMemo(() => {
    return (
      formData.title.trim() &&
      formData.description.trim() &&
      formData.category &&
      formData.value.amount &&
      parseFloat(formData.value.amount) > 0 &&
      formData.podId &&
      (formData.funding_source !== 'pod_treasury' || canUseTreasury)
    );
  }, [formData, canUseTreasury]);

  // Filter pods user can manage (exclude Top Hat and system pods)
  // managablePods now comes from useBountyManagementAccess hook
  // which filters based on both module settings AND role permissions

  useEffect(() => {
    if (
      managablePods.length === 1 &&
      !formData.podId &&
      !hasSetInitialPod.current
    ) {
      setFormData((prev) => ({ ...prev, podId: managablePods[0].id }));
      hasSetInitialPod.current = true;
    }
  }, [managablePods]);

  // Upload metadata to IPFS before transaction
  const handleCreateBounty = async () => {
    try {
      const metadata = {
        title: formData.title,
        description: formData.description,
        requirements: formData.requirements.filter((r) => r.trim()),
        questions: formData.questions.filter((q) => q.trim()),
        work_requirements: formData.work_requirements.filter((w) => w.trim()),
        creator_address: evmAddress,
        timestamp: Date.now(),
      };

      console.log('📤 Uploading metadata to IPFS...');
      const response = await fetch('/api/bounty/ipfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', metadata }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload metadata to IPFS');
      }

      const { ipfsHash: hash } = await response.json();
      setIpfsHash(hash);
      console.log('✅ Metadata uploaded to IPFS:', hash);
    } catch (error) {
      console.error('Error uploading to IPFS:', error);
      setErrors({ ipfs: 'Failed to upload metadata. Please try again.' });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) newErrors.title = 'Title is required';
    if (!formData.description.trim())
      newErrors.description = 'Description is required';
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.value.amount || parseFloat(formData.value.amount) <= 0) {
      newErrors.amount = 'Valid amount is required';
    }
    if (!formData.podId) newErrors.podId = 'Pod selection is required';

    if (formData.funding_source === 'pod_treasury' && !canUseTreasury) {
      newErrors.funding =
        "You do not have permission to use this pod's treasury";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Generate transaction calls with IPFS hash (approval + createBounty)
  const transactionCalls = React.useMemo(() => {
    if (!ipfsHash) return null;

    try {
      // Token address based on selection (FIXED: Use correct Base mainnet addresses)
      const tokenAddress =
        formData.value.token === 'SYSTEM'
          ? ((process.env.NEXT_PUBLIC_SYSTEM_TOKEN ||
              '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5') as `0x${string}`)
          : ((process.env.NEXT_PUBLIC_SELF_TOKEN ||
              '0x1b8d424695E63ABca04E94bA46c03f1D83e14020') as `0x${string}`);

      // Use V3 address if available, otherwise V2
      const BOUNTY_MANAGER_V3 = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_V3_ADDRESS as `0x${string}` | undefined;
      const BOUNTY_MANAGER_V2 = (process.env
        .NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
        '0xc2Ac53e7C869Ed9Bcd21b72C7aE747Abb788A8e5') as `0x${string}`;

      // Determine which contract to approve (must match the contract we're calling)
      const BOUNTY_MANAGER_ADDRESS = BOUNTY_MANAGER_V3 || BOUNTY_MANAGER_V2;

      const amount = parseEther(formData.value.amount);

      console.log('💰 Token Approval Setup:', {
        tokenAddress,
        spender: BOUNTY_MANAGER_ADDRESS,
        amount: formData.value.amount,
        usingV3: !!BOUNTY_MANAGER_V3,
      });

      // ERC20 approve ABI
      const ERC20_APPROVE_ABI = [
        {
          name: 'approve',
          type: 'function',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
        },
      ] as const;

      // V3/V4: Get pod metadata for auto-registration
      const selectedPod = managablePods.find((p) => p.id === formData.podId);
      const leaderHatId = selectedPod?.management_hat_id || undefined;
      const treasuryAddress = selectedPod?.treasury_contract_address || undefined;

      console.log('🔧 V3/V4 Parameters:', {
        podId: formData.podId,
        selectedPod: selectedPod?.name,
        leaderHatId,
        treasuryAddress,
        hasLeaderHat: !!leaderHatId,
        hasTreasury: !!treasuryAddress,
      });

      // Build base bounty call with V3/V4 parameters
      const baseCall = createBountyCall(formData, leaderHatId, treasuryAddress);

      // Replace temporary IPFS hash with real one
      // V4 args: [value, token, paymentType, podId, tempIpfs, leaderHatId, treasuryAddress]
      // We need: [value, token, paymentType, podId, realIpfs, leaderHatId, treasuryAddress]
      const bountyCall = {
        ...baseCall,
        args: [
          ...baseCall.args.slice(0, 4), // Keep: value, token, paymentType, podId
          ipfsHash, // Replace temp IPFS hash with real one
          ...baseCall.args.slice(5), // Keep: leaderHatId, treasuryAddress (if V4)
        ],
      };

      console.log('📦 Final bountyCall args:', {
        paramCount: bountyCall.args.length,
        ipfsHash: bountyCall.args[4],
        leaderHatId: bountyCall.args[5]?.toString(),
        treasuryAddress: bountyCall.args[6],
      });

      // Return array of calls: [approve, createBounty]
      return [
        {
          address: tokenAddress,
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve' as const,
          args: [BOUNTY_MANAGER_ADDRESS, amount], // FIXED: Use correct contract address
        },
        bountyCall,
      ];
    } catch (error) {
      console.error('Error creating transaction calls:', error);
      return null;
    }
  }, [formData, ipfsHash, createBountyCall, managablePods]);

  // CDP Smart Account transaction handler - EXACT FAUCET PATTERN
  const handleCreateBountyTransaction = useCallback(async () => {
    // EXACT FAUCET PATTERN: Simple validation matching faucet
    if (!evmAddress || !transactionCalls || !currentUser?.evmSmartAccounts?.[0]) {
      console.error('❌ Missing requirements for bounty creation:', {
        hasAddress: !!evmAddress,
        hasCalls: !!transactionCalls,
        hasSmartAccount: !!currentUser?.evmSmartAccounts?.[0],
      });
      setErrors({ transaction: 'Smart Wallet not properly configured' });
      return;
    }

    const smartAccount = currentUser.evmSmartAccounts[0]; // EXACT FAUCET PATTERN

    setIsTransactionPending(true); // EXACT FAUCET PATTERN

    try {
      console.log('🚀 Building Smart Account User Operation for bounty creation...');
      console.log('💼 Smart Account:', smartAccount);
      console.log('🎯 Transactions: Approve + CreateBounty');
      console.log('⛽ Paymaster: ENABLED (gasless transaction)');

      // EXACT FAUCET PATTERN: Encode call data for BOTH transactions
      const encodedCalls = transactionCalls.map((call) => ({
        to: call.address as `0x${string}`,
        value: 0n,
        data: encodeFunctionData({
          abi: call.abi,
          functionName: call.functionName as string,
          args: call.args,
        }),
      }));

      console.log('📝 Encoded calls:', encodedCalls.length, 'transactions');
      console.log('⏳ Step 1/3: Submitting transaction to network...');

      // EXACT FAUCET PATTERN: Send user operation with multiple calls
      console.log('📤 Submitting user operation to CDP bundler...');
      console.log('   Smart Account:', smartAccount);
      console.log('   Network: base');
      console.log('   Calls:', encodedCalls.length);
      console.log('   Paymaster: enabled');

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,  // ← Smart Account directly!
        network: 'base',                 // ← Base mainnet
        calls: encodedCalls,             // ← Multiple calls (approve + create)
        useCdpPaymaster: true,           // ← ENABLE GAS SPONSORSHIP!
      });

      console.log('✅ User operation hash received:', result);
      console.log('📝 Full result object:', JSON.stringify(result, null, 2));
      setTransactionStatus('Transaction submitted to bundler...');

      // CDP returns userOperationHash immediately
      // The actual blockchain transaction will be created by the bundler in 30-60 seconds
      const userOpResult = result as any;
      const userOpHash = userOpResult?.userOperationHash;

      console.log('⏳ Step 2/3: User operation submitted, waiting for bundler...');
      console.log(`📝 UserOperation Hash: ${userOpHash}`);

      // Since CDP paymaster transactions take time to bundle, we'll save immediately
      // The cron job will update once the actual transaction is mined
      let receipt = userOpResult?.receipt;

      if (receipt) {
        console.log('✅ Step 3/3: Transaction confirmed! Processing receipt...');
        setTransactionStatus('Transaction confirmed! Saving bounty to database...');

        // Prevent duplicate saves
        if (savedTransactions.current.has(receipt.transactionHash)) {
          console.log('⏭️ Already saved this transaction, skipping');
          return;
        }

        const logs = receipt.logs;
        console.log('📋 Total logs in receipt:', logs?.length);

        // Find BountyCreated event
        const BOUNTY_MANAGER = (process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS ||
          '0x29e653502083442B8B6C7c969557022F6a3CC64C') as `0x${string}`;

        const bountyCreatedLog = logs?.find(
          (log: any) =>
            log.topics &&
            log.topics.length >= 2 &&
            log.address?.toLowerCase() === BOUNTY_MANAGER.toLowerCase(),
        );

        if (bountyCreatedLog && bountyCreatedLog.topics?.[1]) {
          const bountyIdHex = bountyCreatedLog.topics[1];
          const bountyId = BigInt(bountyIdHex).toString();
          console.log('✅ Bounty created on-chain with ID:', bountyId);

          // Mark transaction as saved
          savedTransactions.current.add(receipt.transactionHash);

          // Store bounty ID
          setCreatedBountyId(parseInt(bountyId));

          // If pod treasury funding, show Step 2 and DON'T save to database yet
          if (formData.funding_source === 'pod_treasury') {
            console.log('🏦 Pod treasury funding detected - showing Step 2');
            setShowTreasuryFunding(true);
            return; // Don't save to database until treasury funding is set
          }

          // Save to database
          const tokenAddress =
            formData.value.token === 'SYSTEM'
              ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
              : process.env.NEXT_PUBLIC_SELF_TOKEN;

          if (!tokenAddress) {
            throw new Error(
              `Token address not configured for ${formData.value.token}. Please check NEXT_PUBLIC_SYSTEM_TOKEN and NEXT_PUBLIC_SELF_TOKEN environment variables.`
            );
          }

          console.log('💾 Initiating database save...');
          fetch('/api/bounty/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bountyId,
              transactionHash: receipt.transactionHash,
              creator: evmAddress,
              value: formData.value.amount,
              token: tokenAddress,
              podId: formData.podId,
              ipfsHash,
              title: formData.title,
              description: formData.description,
              category: formData.category,
              deadline: formData.deadline,
              funding_source: formData.funding_source,
              requirements: formData.requirements.filter((r) => r.trim()),
              tasks: formData.tasks.filter((t) => t.trim()),
              questions: formData.questions.filter((q) => q.trim()),
              bid_acceptance_mode: formData.bid_acceptance_mode || 'single',
              max_bids_accepted:
                formData.bid_acceptance_mode === 'multiple'
                  ? formData.max_bids_accepted
                  : formData.bid_acceptance_mode === 'single'
                    ? 1
                    : 0,
              bids_accepted_count: 0,
            }),
          })
            .then(async (saveResponse) => {
              if (!saveResponse.ok) {
                const errorData = await saveResponse.json();
                console.error('❌ Failed to save bounty to database:', errorData);
                setTransactionStatus('⚠️ Transaction succeeded but database save failed. Bounty exists on-chain.');
              } else {
                const saveData = await saveResponse.json();
                console.log('✅ Bounty saved to database successfully:', saveData);
                setTransactionStatus('✅ Bounty created successfully!');
                setTimeout(() => {
                  // Redirect to bounties page without losing CDP session
                  router.push('/bounty');
                }, 2000); // Brief delay to show success message
              }
            })
            .catch((saveError) => {
              console.error('❌ Error saving bounty to database:', saveError);
              setTransactionStatus('⚠️ Transaction succeeded but database save failed. Bounty exists on-chain.');
            });
        } else {
          console.error('❌ Could not find BountyCreated event in logs');
          setTransactionStatus('⚠️ Could not parse bounty ID from transaction. Check transaction on explorer.');
        }
      } else {
        // No receipt yet - this is normal for CDP Smart Accounts
        // Save to database with userOpHash and let it confirm asynchronously
        console.warn('⚠️ No receipt found in result, saving with userOpHash');
        setTransactionStatus('Saving bounty to database (transaction will confirm shortly)...');

        const tokenAddress =
          formData.value.token === 'SYSTEM'
            ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '0xd67e460ce56be18b573aB434b3DC962c657D8Bb5'
            : process.env.NEXT_PUBLIC_SELF_TOKEN || '0x1b8d424695E63ABca04E94bA46c03f1D83e14020';

        // Save without on-chain bountyId (will be updated later)
        console.log('💾 Initiating database save with pending status...');
        fetch('/api/bounty/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bountyId: null, // Will be updated when transaction confirms
            transactionHash: userOpHash, // User operation hash
            creator: evmAddress,
            value: formData.value.amount,
            token: tokenAddress,
            podId: formData.podId,
            ipfsHash,
            title: formData.title,
            description: formData.description,
            category: formData.category,
            deadline: formData.deadline,
            funding_source: formData.funding_source,
            requirements: formData.requirements.filter((r) => r.trim()),
            tasks: formData.tasks.filter((t) => t.trim()),
            questions: formData.questions.filter((q) => q.trim()),
            bid_acceptance_mode: formData.bid_acceptance_mode || 'single',
            max_bids_accepted:
              formData.bid_acceptance_mode === 'multiple'
                ? formData.max_bids_accepted
                : formData.bid_acceptance_mode === 'single'
                  ? 1
                  : 0,
            bids_accepted_count: 0,
            status: 'pending', // Mark as pending until confirmed
          }),
        })
          .then(async (saveResponse) => {
            if (!saveResponse.ok) {
              const errorData = await saveResponse.json();
              console.error('❌ Failed to save bounty to database:', errorData);
              setTransactionStatus('⚠️ Failed to save bounty. Transaction hash: ' + userOpHash);
            } else {
              const saveData = await saveResponse.json();
              console.log('✅ Bounty saved to database with pending status:', saveData);
              setTransactionStatus('✅ Bounty submitted! It will appear once confirmed on-chain.');
              setTimeout(() => {
                // Redirect to bounties page without losing CDP session
                router.push('/bounty');
              }, 2000);
            }
          })
          .catch((saveError) => {
            console.error('❌ Error saving bounty to database:', saveError);
            setTransactionStatus('⚠️ Error saving bounty. Transaction hash: ' + userOpHash);
          });
      }
    } catch (err: any) {
      console.error('❌ Bounty creation failed:', err);
      setErrors({ transaction: err.message || 'Transaction failed. Please try again.' });
      setTransactionStatus('');
    } finally {
      setIsTransactionPending(false); // EXACT FAUCET PATTERN
    }
  }, [evmAddress, currentUser, transactionCalls, sendUserOperation, formData, ipfsHash, onSuccess]);

  // Update array fields
  const updateArrayField = (
    field: 'requirements' | 'questions' | 'work_requirements',
    index: number,
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].map((item, i) => (i === index ? value : item)),
    }));
  };

  const addArrayField = (
    field: 'requirements' | 'questions' | 'work_requirements',
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: [...prev[field], ''],
    }));
  };

  const removeArrayField = (
    field: 'requirements' | 'questions' | 'work_requirements',
    index: number,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  if (podsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div
              className="animate-spin rounded-full h-8 w-8"
              style={{
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: '#2F5D50',
              }}
            ></div>
            <span className="ml-2">Loading pods...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (podsLoading) {
    return (
      <Alert>
        <AlertDescription>
          Loading pods and checking permissions...
        </AlertDescription>
      </Alert>
    );
  }

  if (managablePods.length === 0) {
    return (
      <Alert>
        <AlertDescription>
          <p className="font-semibold mb-2">
            No pods available for bounty creation.
          </p>
          <p className="text-sm">To create bounties in a pod, you need:</p>
          <ul className="list-disc list-inside text-sm mt-2 space-y-1">
            <li>
              <strong>Bounty Module ON</strong> (pod-wide setting)
            </li>
            <li>
              <strong>Bounty Management Permission</strong> (your role in the
              pod)
            </li>
          </ul>
          <p className="text-sm mt-2 text-gray-600">
            Contact your pod administrators to enable the bounty module or grant
            you bounty management permissions.
          </p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create New Bounty</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pod Selection */}
        <div className="space-y-2">
          <Label htmlFor="pod">Pod</Label>
          <Select
            value={formData.podId}
            onValueChange={(value) => {
              setFormData((prev) => ({ ...prev, podId: value }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a pod" />
            </SelectTrigger>
            <SelectContent>
              {managablePods.map((pod) => (
                <SelectItem key={pod.id} value={pod.id}>
                  {pod.name} ({pod.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.podId && (
            <p className="text-sm" style={{ color: '#8B3A3A' }}>
              {errors.podId}
            </p>
          )}
        </div>

        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="Brief, descriptive title"
            />
            {errors.title && (
              <p className="text-sm" style={{ color: '#8B3A3A' }}>
                {errors.title}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, category: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm" style={{ color: '#8B3A3A' }}>
                {errors.category}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Detailed description of the bounty"
            rows={4}
          />
          {errors.description && (
            <p className="text-sm" style={{ color: '#8B3A3A' }}>
              {errors.description}
            </p>
          )}
        </div>

        {/* Value and Funding */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              step="0.0001"
              value={formData.value.amount}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  value: { ...prev.value, amount: e.target.value },
                }))
              }
              placeholder="0.0000"
            />
            {errors.amount && (
              <p className="text-sm" style={{ color: '#8B3A3A' }}>
                {errors.amount}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="token">Token</Label>
            <Select
              value={formData.value.token}
              onValueChange={(value: 'SYSTEM' | 'SELF') =>
                setFormData((prev) => ({
                  ...prev,
                  value: { ...prev.value, token: value },
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SYSTEM">SYSTEM</SelectItem>
                <SelectItem value="SELF">SELF</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="funding">Funding Source</Label>
            <Select
              value={formData.funding_source}
              onValueChange={(value: 'wallet' | 'pod_treasury') =>
                setFormData((prev) => ({
                  ...prev,
                  funding_source: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="wallet">Personal Wallet</SelectItem>
                <SelectItem value="pod_treasury" disabled={!canUseTreasury}>
                  Pod Treasury {!canUseTreasury && '(No Permission)'}
                </SelectItem>
              </SelectContent>
            </Select>
            {errors.funding && (
              <p className="text-sm" style={{ color: '#8B3A3A' }}>
                {errors.funding}
              </p>
            )}
          </div>
        </div>

        {/* Deadline */}
        <div className="space-y-2">
          <Label htmlFor="deadline">Deadline (Optional)</Label>
          <Input
            id="deadline"
            type="datetime-local"
            value={formData.deadline}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, deadline: e.target.value }))
            }
          />
        </div>

        {/* Dynamic Fields */}
        <Tabs defaultValue="requirements" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="requirements">Scope</TabsTrigger>
            <TabsTrigger value="work">Tasks</TabsTrigger>
            <TabsTrigger value="questions">Questions</TabsTrigger>
          </TabsList>

          <TabsContent value="requirements" className="space-y-2">
            <Label>Requirements</Label>
            {formData.requirements.map((req, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={req}
                  onChange={(e) =>
                    updateArrayField('requirements', index, e.target.value)
                  }
                  placeholder="Enter requirement"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayField('requirements', index)}
                  disabled={formData.requirements.length === 1}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addArrayField('requirements')}
            >
              Add Requirement
            </Button>
          </TabsContent>

          <TabsContent value="questions" className="space-y-2">
            <Label>Application Questions</Label>
            {formData.questions.map((question, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={question}
                  onChange={(e) =>
                    updateArrayField('questions', index, e.target.value)
                  }
                  placeholder="Enter question for applicants"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayField('questions', index)}
                  disabled={formData.questions.length === 1}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addArrayField('questions')}
            >
              Add Question
            </Button>
          </TabsContent>

          <TabsContent value="work" className="space-y-2">
            <Label>Tasks</Label>
            {formData.tasks.map((task, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={task}
                  onChange={(e) =>
                    updateArrayField('tasks', index, e.target.value)
                  }
                  placeholder="Enter specific task"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeArrayField('tasks', index)}
                  disabled={formData.tasks.length === 1}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addArrayField('tasks')}
            >
              Add Task
            </Button>
          </TabsContent>
        </Tabs>

        {/* Bid Acceptance Settings */}
        <div className="space-y-4 border-2 border-gray-200 rounded-lg p-4 bg-gray-50">
          <div>
            <Label className="text-lg font-semibold">
              Bid Acceptance Settings
            </Label>
            <p className="text-sm text-gray-600 mt-1">
              Control how many bids you want to accept for this bounty
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bid-acceptance-mode">Acceptance Mode</Label>
            <Select
              value={formData.bid_acceptance_mode || 'single'}
              onValueChange={(
                value: 'single' | 'multiple' | 'unlimited' | 'date_limited',
              ) =>
                setFormData((prev) => ({
                  ...prev,
                  bid_acceptance_mode: value,
                  max_bids_accepted:
                    value === 'multiple' ? 3 : value === 'single' ? 1 : 0,
                }))
              }
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="single">Accept 1 Bid (Default)</SelectItem>
                <SelectItem value="multiple">
                  Accept Multiple Bids (X)
                </SelectItem>
                <SelectItem value="unlimited">Accept Unlimited Bids</SelectItem>
                <SelectItem value="date_limited">
                  Accept Until Deadline
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.bid_acceptance_mode === 'multiple' && (
            <div className="space-y-2">
              <Label htmlFor="max-bids">Maximum Bids to Accept</Label>
              <Input
                id="max-bids"
                type="number"
                min="2"
                max="100"
                value={formData.max_bids_accepted || 3}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    max_bids_accepted: Math.max(
                      2,
                      Math.min(100, parseInt(e.target.value) || 2),
                    ),
                  }))
                }
                className="bg-white"
              />
            </div>
          )}

          {/* Mode Description */}
          <Alert
            style={
              formData.bid_acceptance_mode === 'single'
                ? {
                    borderColor: '#B8D9CA',
                    backgroundColor: '#E8F1EE',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                  }
                : formData.bid_acceptance_mode === 'multiple'
                  ? {
                      borderColor: '#D1CAD9',
                      backgroundColor: '#EDEAF0',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                    }
                  : formData.bid_acceptance_mode === 'unlimited'
                    ? {
                        borderColor: '#B8D9CA',
                        backgroundColor: '#D1E6DC',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                      }
                    : {
                        borderColor: '#E8D7B8',
                        backgroundColor: '#FAF4EC',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                      }
            }
          >
            <AlertDescription
              style={
                formData.bid_acceptance_mode === 'single'
                  ? { color: '#1F453A' }
                  : formData.bid_acceptance_mode === 'multiple'
                    ? { color: '#574C66' }
                    : formData.bid_acceptance_mode === 'unlimited'
                      ? { color: '#1F453A' }
                      : { color: '#8F6B2F' }
              }
            >
              {formData.bid_acceptance_mode === 'single' && (
                <div>
                  <div className="font-medium mb-1">Single Bid Mode</div>
                  <div className="text-sm">
                    You will select ONE winning bid. Once accepted, the bounty
                    automatically closes.
                  </div>
                </div>
              )}
              {formData.bid_acceptance_mode === 'multiple' && (
                <div>
                  <div className="font-medium mb-1">Multiple Bids Mode</div>
                  <div className="text-sm">
                    You can accept up to {formData.max_bids_accepted} bids.
                    Useful for parallel work, redundancy, or team collaboration.
                    Bounty closes after reaching the limit.
                  </div>
                </div>
              )}
              {formData.bid_acceptance_mode === 'unlimited' && (
                <div>
                  <div className="font-medium mb-1">Unlimited Bids Mode</div>
                  <div className="text-sm">
                    Accept as many bids as you want. Bounty stays open until you
                    manually close it. Ideal for ongoing work or community
                    contributions.
                  </div>
                </div>
              )}
              {formData.bid_acceptance_mode === 'date_limited' && (
                <div>
                  <div className="font-medium mb-1">Date-Limited Mode</div>
                  <div className="text-sm">
                    Accept bids until the deadline. After the deadline passes,
                    no more bids can be accepted. You can accept multiple bids
                    before the deadline.
                  </div>
                </div>
              )}
            </AlertDescription>
          </Alert>
        </div>

        {/* Transaction Error */}
        {errors.transaction && (
          <Alert
            style={{
              backgroundColor: '#F5E6E6',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#D9B3B3',
            }}
          >
            <AlertDescription style={{ color: '#5C1F1F' }}>
              {errors.transaction}
            </AlertDescription>
          </Alert>
        )}

        {/* IPFS Upload Error */}
        {errors.ipfs && (
          <Alert
            style={{
              backgroundColor: '#F5E6E6',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#D9B3B3',
            }}
          >
            <AlertDescription style={{ color: '#5C1F1F' }}>
              {errors.ipfs}
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          {showTreasuryFunding && createdBountyId ? (
            /* Step 2: Set Treasury Funding */
            <div className="w-full">
              <BountyTreasuryFundingTransaction
                bountyId={createdBountyId}
                podId={formData.podId}
                onSuccess={async () => {
                  console.log('✅ Treasury funding set successfully');

                  // Now save to database with correct funding source
                  const tokenAddress =
                    formData.value.token === 'SYSTEM'
                      ? process.env.NEXT_PUBLIC_SYSTEM_TOKEN
                      : process.env.NEXT_PUBLIC_SELF_TOKEN;

                  if (!tokenAddress) {
                    throw new Error(
                      `Token address not configured for ${formData.value.token}. Please check NEXT_PUBLIC_SYSTEM_TOKEN and NEXT_PUBLIC_SELF_TOKEN environment variables.`
                    );
                  }

                  try {
                    const response = await fetch('/api/bounty/create', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        bountyId: createdBountyId.toString(),
                        transactionHash: '0x', // Already on-chain
                        creator: evmAddress,
                        value: formData.value.amount,
                        token: tokenAddress,
                        podId: formData.podId,
                        ipfsHash,
                        title: formData.title,
                        description: formData.description,
                        category: formData.category,
                        deadline: formData.deadline,
                        funding_source: 'pod_treasury', // CRITICAL: Set to pod_treasury
                        requirements: formData.requirements.filter((r) =>
                          r.trim(),
                        ),
                        tasks: formData.tasks.filter((t) => t.trim()),
                        questions: formData.questions.filter((q) => q.trim()),
                        bid_acceptance_mode:
                          formData.bid_acceptance_mode || 'single',
                        max_bids_accepted:
                          formData.bid_acceptance_mode === 'multiple'
                            ? formData.max_bids_accepted
                            : formData.bid_acceptance_mode === 'single'
                              ? 1
                              : 0,
                        bids_accepted_count: 0,
                      }),
                    });

                    if (response.ok) {
                      console.log('✅ Pod-funded bounty saved to database');
                      onSuccess?.(createdBountyId.toString());
                    } else {
                      console.error(
                        '❌ Failed to save pod-funded bounty to database',
                      );
                    }
                  } catch (error) {
                    console.error('❌ Error saving pod-funded bounty:', error);
                  }
                }}
                onError={(error) => {
                  console.error('❌ Treasury funding failed:', error);
                  setErrors({ treasury: error });
                }}
              />
            </div>
          ) : !ipfsHash ? (
            <Button
              onClick={() => {
                if (validateForm()) {
                  handleCreateBounty();
                }
              }}
              disabled={!isFormValid}
              className="flex-1"
            >
              Prepare Bounty
            </Button>
          ) : transactionCalls ? (
            <>
              {/* Show Register Pod Button if needed */}
              <div className="flex-1 space-y-3">
                <div className="pt-2 border-t">
                  <Button
                    onClick={handleCreateBountyTransaction}
                    disabled={isTransactionPending || !currentUser?.evmSmartAccounts?.[0]}
                    className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed font-medium py-2 px-4 rounded transition-colors hover:opacity-90"
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

                  {/* Transaction Status Message */}
                  {isTransactionPending && transactionStatus && (
                    <Alert className="mt-3">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <AlertDescription className="ml-2">
                        {transactionStatus}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </>
          ) : null}

          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>

        {/* Permissions Info */}
        {formData.podId && (
          <Alert
            style={{
              backgroundColor: '#E8F1EE',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: '#B8D9CA',
            }}
          >
            <AlertDescription style={{ color: '#1F453A' }}>
              <strong>Database Permissions for selected pod:</strong>
              <br />• Bounty Management:{' '}
              {canManageBounties ? '✅ Enabled' : '❌ Disabled (enable in pod manage page)'}
              <br />• Treasury Management:{' '}
              {canUseTreasury ? '✅ Enabled' : '❌ Disabled (enable in pod manage page)'}
              <br />
              <span className="text-xs text-gray-600">
                💡 Enable permissions in: Pods → {managablePods.find(p => p.id === formData.podId)?.name} → Manage → Controls → Permissions
              </span>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

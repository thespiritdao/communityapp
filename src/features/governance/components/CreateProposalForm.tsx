'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useBlockNumber,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionSponsor,
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction 
} from '@coinbase/onchainkit/transaction';
import { useQueryClient } from '@tanstack/react-query';
import { base } from 'viem/chains';
import { encodeFunctionData } from 'viem';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
import { ProposalThreadSelector } from './ProposalThreadSelector';
import { useToast } from 'src/components/ui/use-toast';
import { createPublicClient, http } from 'viem';
import { useForum } from 'src/features/forum/hooks/useForum';
import { supabase } from 'src/utils/supabaseClient';
import { fetchTokenBalances } from 'src/utils/fetchTokenBalances';
import UserTagging from 'src/components/UserTagging';
import { useGovernanceNotifications } from 'src/context/GovernanceNotificationContext';
import { governanceNotificationService } from 'src/utils/governanceNotificationService';
import { parseAbiItem, parseEventLogs } from 'viem';

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;

if (!GOVERNOR_ADDRESS || !ADVOCATE_ADDRESS) {
  throw new Error('Missing contract addresses');
}

interface ProposalFormData {
  title: string;
  body: string;
  forumThreadId: string;
  selectedToken: string; // token gating
}

interface CreateProposalFormProps {
  onSuccess?: () => void;
}

// Helper function to validate BigInt values
const validateBigIntArray = (values: any[], fieldName: string): bigint[] => {
  
  if (!Array.isArray(values)) {
    console.error(`❌ ${fieldName} is not an array:`, values);
    throw new Error(`${fieldName} must be an array`);
  }
  
  return values.map((value, index) => {
    
    if (value === null || value === undefined) {
      console.error(`❌ ${fieldName}[${index}] is null/undefined`);
      throw new Error(`${fieldName}[${index}] cannot be null or undefined`);
    }
    
    if (typeof value === 'bigint') {
      return value;
    }
    
    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        console.error(`❌ ${fieldName}[${index}] is NaN or infinite:`, value);
        throw new Error(`${fieldName}[${index}] cannot be NaN or infinite`);
      }
      const bigIntValue = BigInt(value);
      return bigIntValue;
    }
    
    if (typeof value === 'string') {
      if (value.trim() === '' || value === 'NaN') {
        console.error(`❌ ${fieldName}[${index}] is empty string or 'NaN':`, value);
        throw new Error(`${fieldName}[${index}] cannot be empty or 'NaN'`);
      }
      try {
        const bigIntValue = BigInt(value);
        return bigIntValue;
      } catch (error) {
        console.error(`❌ Failed to convert ${fieldName}[${index}] string to BigInt:`, value, error);
        throw new Error(`${fieldName}[${index}] '${value}' is not a valid integer`);
      }
    }
    
    console.error(`❌ ${fieldName}[${index}] has unsupported type:`, typeof value, value);
    throw new Error(`${fieldName}[${index}] has unsupported type: ${typeof value}`);
  });
};

// Helper function to validate address arrays
const validateAddressArray = (addresses: any[], fieldName: string): `0x${string}`[] => {
  
  if (!Array.isArray(addresses)) {
    console.error(`❌ ${fieldName} is not an array:`, addresses);
    throw new Error(`${fieldName} must be an array`);
  }
  
  return addresses.map((address, index) => {
    
    if (typeof address !== 'string') {
      console.error(`❌ ${fieldName}[${index}] is not a string:`, typeof address, address);
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
    
    if (!address.startsWith('0x')) {
      console.error(`❌ ${fieldName}[${index}] doesn't start with 0x:`, address);
      throw new Error(`${fieldName}[${index}] must start with 0x`);
    }
    
    if (address.length !== 42) {
      console.error(`❌ ${fieldName}[${index}] has wrong length:`, address.length, address);
      throw new Error(`${fieldName}[${index}] must be 42 characters long`);
    }
    
    return address as `0x${string}`;
  });
};

// Helper function to validate calldata arrays
const validateCalldataArray = (calldatas: any[], fieldName: string): `0x${string}`[] => {
  
  if (!Array.isArray(calldatas)) {
    console.error(`❌ ${fieldName} is not an array:`, calldatas);
    throw new Error(`${fieldName} must be an array`);
  }
  
  return calldatas.map((calldata, index) => {
    
    if (typeof calldata !== 'string') {
      console.error(`❌ ${fieldName}[${index}] is not a string:`, typeof calldata, calldata);
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
    
    if (!calldata.startsWith('0x')) {
      console.error(`❌ ${fieldName}[${index}] doesn't start with 0x:`, calldata);
      throw new Error(`${fieldName}[${index}] must start with 0x`);
    }
    
    return calldata as `0x${string}`;
  });
};

// Add validation utility (copied from Cart.tsx)
const validateTransactionData = (data: any) => {
  const validation = {
    isValid: true,
    issues: [] as string[],
    data: {} as any
  };
  try {
    validation.data = JSON.parse(JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }));
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');
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

export const CreateProposalForm: React.FC<CreateProposalFormProps> = ({ onSuccess }) => {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ProposalFormData>({
    title: '',
    body: '',
    forumThreadId: '',
    selectedToken: '',
  });
  const [userTokens, setUserTokens] = useState<{ id: string; label: string }[]>([]);
  const { loadPosts } = useForum();
  const { createProposalMentionNotification, createProposalCreatedNotification, refreshNotifications } = useGovernanceNotifications();

  const [debugMode, setDebugMode] = useState(true);
  const [isDelegating, setIsDelegating] = useState(false);
  const [delegationTxHash, setDelegationTxHash] = useState<`0x${string}` | undefined>();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hasProcessedProposal, setHasProcessedProposal] = useState<string | null>(null);

  // Get the latest block number (Base chain)
  const { data: latestBlock } = useBlockNumber();

  // Wait for delegation transaction confirmation
  const { isLoading: isDelegationPending, isSuccess: isDelegationSuccess } = useWaitForTransactionReceipt({
    hash: delegationTxHash,
    confirmations: 2, // Wait for 2 confirmations on Base
  });

  // Read NFT balance with more robust error handling
	const {
	  data: nftBalance,
	  isLoading: isLoadingBalance,
	  refetch: refetchBalance,
	  error: balanceError
	} = useReadContract({
	  address: ADVOCATE_ADDRESS,
	  abi: AdvocateMembershipABI,
	  functionName: 'balanceOf',
	  args: address ? [address] : undefined,
	  query: {
		enabled: !!address && !!ADVOCATE_ADDRESS && isConnected,
		staleTime: 60000,       // ✅ 1 minute
		gcTime: 120000,         // ✅ 2 minutes
		retry: (failureCount, error) => {
		  if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
			return false;
		  }
		  return failureCount < 2;
		},
		retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
	  }
	});

  // Robust Voting Power Hooks
	const {
	  data: votingPower,
	  refetch: refetchVotingPower,
	  isLoading: isLoadingVotingPower,
	  error: votingPowerError
	} = useReadContract({
	  address: ADVOCATE_ADDRESS,
	  abi: AdvocateMembershipABI,
	  functionName: 'getVotes',
	  args: address ? [address] : undefined,
	  query: {
		enabled: !!address && !!ADVOCATE_ADDRESS && isConnected,
		refetchInterval: false, // ✅ Disable automatic refetching to reduce calls
		staleTime: 60000,       // ✅ 1 minute - data stays fresh longer
		gcTime: 120000,         // ✅ 2 minutes - keep in cache longer
		retry: (failureCount, error) => {
		  // Don't retry on rate limit errors
		  if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
			return false;
		  }
		  return failureCount < 2; // Only retry twice for other errors
		},
		retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
	  }
	});


  // Check current delegate with better error handling
	const {
	  data: currentDelegate,
	  refetch: refetchDelegate,
	  error: delegateError
	} = useReadContract({
	  address: ADVOCATE_ADDRESS,
	  abi: AdvocateMembershipABI,
	  functionName: 'delegates',
	  args: address ? [address] : undefined,
	  query: {
		enabled: !!address && !!ADVOCATE_ADDRESS && isConnected,
		staleTime: 60000,       // ✅ 1 minute
		gcTime: 120000,         // ✅ 2 minutes
		retry: (failureCount, error) => {
		  if (error?.message?.includes('429') || error?.message?.includes('rate limit')) {
			return false;
		  }
		  return failureCount < 2;
		},
		retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 10000),
	  }
	});

  // Get proposal threshold
  const {
    data: proposalThreshold,
    isLoading: isLoadingThreshold
  } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposalThreshold',
    query: {
      enabled: !!GOVERNOR_ADDRESS && isConnected,
    }
  });

  // Public client for direct RPC test
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.NEXT_PUBLIC_RPC_URL!),
  });

	// Handle delegation transaction completion
	useEffect(() => {
	  if (isDelegationSuccess && delegationTxHash) {
		        // Delegation transaction confirmed
		
		// Clear caches and refetch after delegation success
		setTimeout(async () => {
		  // Invalidate all queries to force fresh data
		  queryClient.invalidateQueries();
		  
		  await Promise.all([
			refetchVotingPower(),
			refetchDelegate(),
			refetchBalance()
		  ]);
		  
		  setIsDelegating(false);
		  setDelegationTxHash(undefined);
		  
		  toast({
			title: "Delegation Successful!",
			description: "Your voting power is now active. You can create proposals.",
		  });
		}, 3000);
	  }
	}, [isDelegationSuccess, delegationTxHash, queryClient, refetchVotingPower, refetchDelegate, refetchBalance, toast]); // ❌ Removed votingPowerQueryKey from dependencies

  // Fetch user tokens on mount or address change
  useEffect(() => {
    async function fetchTokens() {
      if (!address) return;
      try {
        const balances = await fetchTokenBalances(address);
        const tokens: { id: string; label: string }[] = [];
        if (balances.hasProofOfCuriosity) tokens.push({ id: 'poc', label: 'Proof of Curiosity' });
        if (balances.hasExecutivePod) tokens.push({ id: 'exec', label: 'Executive Pod' });
        if (balances.hasDevPod) tokens.push({ id: 'dev', label: 'Dev Pod' });
        if (balances.hasMarketAdmin) tokens.push({ id: 'market', label: 'Market Admin' });
        if (balances.hasBountyHat) tokens.push({ id: 'bounty', label: 'Bounty Hat' });
        setUserTokens(tokens);
      } catch (error) {
        console.error('Error fetching user tokens:', error);
        setUserTokens([]);
      }
    }
    fetchTokens();
  }, [address]);

  // Determine delegation needs with enhanced logic
  const needsDelegation = React.useMemo(() => {
    // If we're still loading data, don't make a decision yet
    if (isLoadingBalance || isLoadingVotingPower) {
      return false;
    }

    // If we don't have an address, no delegation needed
    if (!address) {
      return false;
    }

    // If we have no NFT balance, no delegation needed (but also can't propose)
    if (!nftBalance || BigInt(nftBalance.toString()) === 0n) {
      return false;
    }

    // If we have voting power, check if we're properly delegated
    if (votingPower && BigInt(votingPower.toString()) > 0n) {
      // Check if we're delegated to ourselves
      const isDelegatedToSelf = currentDelegate && 
        currentDelegate.toLowerCase() === address.toLowerCase();
      return !isDelegatedToSelf;
    }

    // If we have NFTs but no voting power, we need delegation
    return true;
  }, [address, nftBalance, votingPower, currentDelegate, isLoadingBalance, isLoadingVotingPower]);

  // Enhanced delegation handlers
  const handleDelegationStart = () => {
    // Starting delegation process
    setIsDelegating(true);
  };

  const handleDelegationSuccess = (transactionHash: `0x${string}`) => {
          // Delegation transaction submitted
    setDelegationTxHash(transactionHash);
    // Don't set isDelegating to false here - wait for confirmation
  };

  const handleDelegationError = (error: any) => {
    console.error('Delegation failed:', error);
    setIsDelegating(false);
    setDelegationTxHash(undefined);
    
    let errorMessage = 'Unknown error occurred';
    
    // Parse common error types
    if (error.message?.includes('NaN')) {
      errorMessage = 'Invalid address parameter. Please try refreshing the page.';
    } else if (error.shortMessage) {
      errorMessage = error.shortMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    toast({
      title: "Delegation Failed",
      description: errorMessage,
      variant: 'destructive',
    });
  };

  // Handler for thread selection
  const handleThreadSelect = async (threadId: string) => {
    setFormData(prev => ({ ...prev, forumThreadId: threadId }));
    if (threadId) {
      const result = await loadPosts(threadId, 0, 1);
      if (result.success && result.posts && result.posts.length > 0) {
        setFormData(prev => ({ ...prev, body: result.posts[0].content }));
      }
    }
  };

  // Form handlers
  const handleFormChange = (field: keyof ProposalFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setHasInteracted(true);
    // Clear validation error when form changes
    if (validationError) {
      setValidationError(null);
    }
  };

  // Check if user can create proposals
  const canCreateProposal = React.useMemo(() => {
    
    // Proper null/undefined checks
    if (votingPower === undefined || proposalThreshold === undefined) {
      return false;
    }
    try {
      const votingPowerBigInt = BigInt(votingPower.toString());
      const thresholdBigInt = BigInt(proposalThreshold.toString());
      const canCreate = votingPowerBigInt >= thresholdBigInt;
      return canCreate;
    } catch (error) {
      console.error('BigInt conversion error:', error);
      return false;
    }
  }, [votingPower, proposalThreshold, isLoadingThreshold]);

  // ENHANCED: Memoized proposal arguments with comprehensive validation and logging
	const proposalArgs = React.useMemo(() => {
	  
	  
	  const targets = [ADVOCATE_ADDRESS];
	  const values = [0n];
	  const calldatas = [encodeFunctionData({
		abi: AdvocateMembershipABI,
		functionName: "name",
		args: [],
	  })];
	  
	  
	  const description = `# ${formData.title}\n\n${formData.body}${formData.forumThreadId ? `\n\nForum: ${formData.forumThreadId}` : ''}`;
	  try {
		setValidationError(null);

		// Only validate if user has actually started filling out the form and the form is not empty
		if (hasInteracted && (formData.title || formData.body)) {
			if (!formData.title?.trim()) throw new Error('Title is required and cannot be empty');
			if (!formData.body?.trim()) throw new Error('Body is required and cannot be empty');
		}
		if (targets.length !== values.length || targets.length !== calldatas.length) {
		  throw new Error(`Array length mismatch: targets(${targets.length}), values(${values.length}), calldatas(${calldatas.length})`);
		}

		// Log the constructed values for debug
		  // Removed console.log statements for cleaner output

		return [
		  targets,
		  values,
		  calldatas,
		  description,
		  formData.title,
		  formData.forumThreadId || '',
		] as const;
	  } catch (error) {
		// Only log error if user is actively editing and form is not empty
		if (hasInteracted && (formData.title || formData.body)) {
			console.error('❌ === PROPOSAL ARGS PREPARATION FAILED ===');
			console.error('Error:', error);
			setValidationError(error instanceof Error ? error.message : 'Unknown validation error');
		}
		// Return safe defaults so the component doesn't crash (but this proposal will fail to send)
		return [
		  targets,
		  values,
		  calldatas,
		  description,
		  formData.title,
		  formData.forumThreadId || '',
		] as const;
	  }
	}, [formData, ADVOCATE_ADDRESS, AdvocateMembershipABI, hasInteracted]);


  // Enhanced validation for submit button
  const canSubmitProposal = React.useMemo(() => {
    
    const checks = {
      canCreateProposal,
      needsDelegation: !needsDelegation,
      hasTitle: formData.title.trim().length > 0,
      hasBody: formData.body.trim().length > 0,
      notDelegating: !isDelegating,
      noValidationError: !validationError,
      argsValid: proposalArgs && proposalArgs[0].length > 0 && proposalArgs[1].length > 0
    };
    
    
    const canSubmit = Object.values(checks).every(Boolean);
    
    return (
      canSubmit &&
      !!formData.forumThreadId &&
      !!formData.selectedToken
    );
  }, [canCreateProposal, needsDelegation, formData.title, formData.body, isDelegating, validationError, proposalArgs]);

  // Early return for connection issues
  if (!isConnected || !address) {
    return (
      <div className="proposal-form p-6">
        <h2 className="text-2xl font-bold mb-4">Create a New Proposal</h2>
        <div className="text-red-600 mb-4">
          Please connect your wallet to create proposals.
        </div>
      </div>
    );
  }

  if (chainId !== base.id) {
    return (
      <div className="proposal-form p-6">
        <h2 className="text-2xl font-bold mb-4">Create a New Proposal</h2>
        <div className="text-red-600 mb-4">
          Please switch to Base network. Currently on chain ID: {chainId}
        </div>
      </div>
    );
  }

  if (!GOVERNOR_ADDRESS || !ADVOCATE_ADDRESS) {
    return (
      <div className="proposal-form p-6">
        <h2 className="text-2xl font-bold mb-4">Create a New Proposal</h2>
        <div className="text-red-600 mb-4">
          Missing contract addresses in environment variables.
        </div>
      </div>
    );
  }
  
  const proposeCall = {
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposeWithMetadata',
    args: [...proposalArgs] as unknown as any[], // flatten tuple to array to avoid deep type recursion
  };

  // Validate transaction data before rendering Transaction
  const transactionData = {
    address: address?.toLowerCase() as `0x${string}`,
    chainId: base.id, // Use base.id for Base
    calls: [proposeCall],
    isSponsored: true
  };
  const validation = validateTransactionData(transactionData);
  if (!validation.isValid) {
    console.error('Invalid transaction data:', validation.issues);
  } else {
    // Transaction data validated successfully
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Submit Proposal
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Create a new proposal for the SpiritDAO community to vote on. 
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {/* Status Bar */}
          <div className="px-6 py-4" style={{ backgroundColor: '#e9f9ec', color: '#000' }}>
                          <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                  <span className="text-sm font-medium">
                    {isConnected ? 'Identity Confirmed' : 'Identity Unconfirmed'}
                  </span>
                </div>
                {isConnected && (
                  <div className="text-sm">
                    <span className="opacity-75">Advocate NFTs: </span>
                    <span className="font-semibold">{nftBalance?.toString() || '0'}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-8">
      
            {/* Validation Error Display */}
            {validationError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-red-800 font-medium mb-2">Validation Error</h4>
                <p className="text-red-700 text-sm">{validationError}</p>
              </div>
            )}
      


            {/* Requirements */}
            <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="text-blue-900 font-semibold mb-3">📋 Proposal Requirements</h4>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-blue-800">
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                    Wallet connected
                  </div>
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${nftBalance && BigInt(nftBalance.toString()) > 0n ? 'bg-green-500' : 'bg-red-500'}`} />
                    Hold at least 1 Advocate NFT
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${formData.title.length >= 10 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    Clear, descriptive title
                  </div>
                  <div className="flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${formData.body.length >= 50 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    Detailed description (50+ chars)
                  </div>
                </div>
              </div>
            </div>

                        {/* Enhanced Delegation Section */}
            {needsDelegation && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-5 h-5 text-yellow-600 mr-3">⚠️</div>
                  <p className="text-yellow-800 font-medium">Delegation Required</p>
                </div>
                <p className="text-sm text-yellow-700 mt-2">
                  You own {nftBalance?.toString()} NFT(s) but need to delegate voting power to yourself to create proposals.
                </p>
          
                {isDelegating && (
                  <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                    {isDelegationPending ? '⏳ Waiting for transaction confirmation...' : '🔄 Delegation in progress...'}
                  </div>
                )}
          
          <div className="flex flex-col space-y-2">
            <Transaction
              isSponsored={true}
              chainId={base.id} // Use base.id for Base
              calls={[{
                address: ADVOCATE_ADDRESS,
                abi: AdvocateMembershipABI,
                functionName: 'delegate',
                args: [address as `0x${string}`], // Explicit type casting to ensure it's not undefined
              }]}
              onStatus={(status) => {
                if (status.statusName === 'buildingTransaction') {
                  handleDelegationStart();
                }
              }}
              onSuccess={async (response) => {
                if (response?.transactionReceipts?.[0]?.transactionHash) {
                  handleDelegationSuccess(response.transactionReceipts[0].transactionHash as `0x${string}`);
                }
              }}
              onError={(error) => {
                handleDelegationError(error);
              }}
            >
              <TransactionButton
                text={isDelegating ? "Delegating..." : "Delegate Voting Power to Myself"}
                disabled={isDelegating || !address}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
            <div className="text-xs text-yellow-600">
              This transaction will delegate your NFT voting power to yourself, enabling you to vote and create proposals.
              {address && <div className="mt-1">Delegating to: {address}</div>}
            </div>
          </div>
        </div>
      )}

            {/* Force Delegation Section - for when user has NFTs but no voting power */}
            {!needsDelegation && nftBalance && BigInt(nftBalance.toString()) > 0n && 
             (!votingPower || BigInt(votingPower.toString()) === 0n) && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center">
                  <div className="w-5 h-5 text-red-600 mr-3">🚨</div>
                  <p className="text-red-800 font-medium">Voting Power Issue Detected</p>
                </div>
                <p className="text-sm text-red-700 mt-2">
                  You own {nftBalance.toString()} NFT(s) but have {votingPower?.toString() || '0'} voting power. 
                  This may be due to a contract redeployment. Please delegate your voting power.
                </p>
          
          <div className="flex flex-col space-y-2">
            <Transaction
              isSponsored={true}
              chainId={base.id} // Use base.id for Base
              calls={[{
                address: ADVOCATE_ADDRESS,
                abi: AdvocateMembershipABI,
                functionName: 'delegate',
                args: [address as `0x${string}`],
              }]}
              onSuccess={async (response) => {
                // Force delegation successful
                toast({
                  title: "Delegation Successful!",
                  description: "Your voting power should now be active. Please refresh the page.",
                });
                // Force refetch after a delay
                setTimeout(() => {
                  refetchVotingPower();
                  refetchDelegate();
                  refetchBalance();
                }, 3000);
              }}
              onError={(error) => {
                toast({
                  title: "Delegation Failed",
                  description: error.message || 'Unknown error',
                  variant: 'destructive',
                });
              }}
            >
              <TransactionButton
                text="Force Delegate Voting Power"
                className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
              />
              <TransactionSponsor />
              <TransactionStatus>
                <TransactionStatusLabel />
                <TransactionStatusAction />
              </TransactionStatus>
            </Transaction>
            <div className="text-xs text-red-600">
              This will delegate your NFT voting power to yourself. This is needed after contract redeployments.
            </div>
          </div>
        </div>
      )}

            {/* Enhanced Debug Info */}
            <details className="mb-6">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={debugMode}
                  onChange={(e) => setDebugMode(e.target.checked)}
                  className="mr-2"
                />
                Enhanced Debug Information
              </summary>
              <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono space-y-1">
          <div>Address: {address || 'N/A'}</div>
          <div>Connector: {connector?.name || 'N/A'}</div>
          <div>NFT Balance: {nftBalance?.toString() || 'N/A'}</div>
          <div>Voting Power: {votingPower?.toString() || 'N/A'}</div>
          <div>Proposal Threshold: {proposalThreshold?.toString() || 'N/A'}</div>
          <div>Current Delegate: {currentDelegate || 'N/A'}</div>
          <div>Needs Delegation: {needsDelegation ? 'Yes' : 'No'}</div>
          <div>Can Create Proposal: {canCreateProposal ? 'Yes' : 'No'}</div>
          <div>Can Submit Proposal: {canSubmitProposal ? 'Yes' : 'No'}</div>
          <div>Is Delegating: {isDelegating ? 'Yes' : 'No'}</div>
          <div>Delegation Tx: {delegationTxHash || 'N/A'}</div>
          <div>Delegation Pending: {isDelegationPending ? 'Yes' : 'No'}</div>
          <div>Validation Error: {validationError || 'None'}</div>
          <div>Proposal Args Length: targets={proposalArgs[0].length}, values={proposalArgs[1].length}, calldatas={proposalArgs[2].length}</div>
          <div>Proposal Values: [{proposalArgs[1].map(v => v.toString()).join(', ')}]</div>
          <div>Proposal Value Types: [{proposalArgs[1].map(v => typeof v).join(', ')}]</div>
          {balanceError && <div className="text-red-600">Balance Error: {balanceError.message}</div>}
          {votingPowerError && <div className="text-red-600">Voting Power Error: {votingPowerError.message}</div>}
          {delegateError && <div className="text-red-600">Delegate Error: {delegateError.message}</div>}
        </div>
      </details>

            {/* Proposal Form */}
            <div className="space-y-6">
              {/* Forum Thread Selection (now required and above) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Link Forum Discussion
                </label>
                <ProposalThreadSelector
                  onThreadSelect={handleThreadSelect}
                />
                {!formData.forumThreadId && (
                  <p className="text-red-600 text-xs mt-1">Forum thread is required.</p>
                )}
              </div>
              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-semibold text-gray-700 mb-2">
                  Proposal Title *
                </label>
                <input
                  id="title"
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  value={formData.title}
                  onChange={e => handleFormChange('title', e.target.value)}
                  placeholder="Enter a clear, descriptive title for your proposal"
                  disabled={isDelegating}
                  maxLength={200}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Make it clear and specific - this will be the main identifier for your proposal
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.title.length}/200
                  </span>
                </div>
              </div>
              {/* Description */}
              <div>
                <label htmlFor="body" className="block text-sm font-semibold text-gray-700 mb-2">
                  Proposal Description *
                </label>
                <UserTagging
                  value={formData.body}
                  onChange={(value) => handleFormChange('body', value)}
                  placeholder="Provide a detailed description of your proposal... Use @ to mention someone"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
                  multiLine={true}
                  contextType="governance"
                  contextId="new-proposal"
                  contextUrl="/governance"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Supports Markdown formatting. One paragraph summarizing the proposal purpose and the impact.
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.body.length}/10,000
                  </span>
                </div>
              </div>
              {/* Pod/Token Dropdown */}
              <div>
                <label htmlFor="token" className="block text-sm font-semibold text-gray-700 mb-2">
                  Accessible To (Pod/Token) *
                </label>
                <select
                  id="token"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                  value={formData.selectedToken}
                  onChange={e => handleFormChange('selectedToken', e.target.value)}
                  required
                >
                  <option value="">Select a token</option>
                  {userTokens.map(token => (
                    <option key={token.id} value={token.id}>{token.label}</option>
                  ))}
                </select>
                {!formData.selectedToken && (
                  <p className="text-red-600 text-xs mt-1">Token selection is required.</p>
                )}
              </div>
            </div>
        
            {/* Submit Section */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              {/* Show specific blocking reasons */}
              {!canSubmitProposal && hasInteracted && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="text-yellow-800 font-medium mb-2">Cannot Submit Proposal:</h4>
                  <ul className="text-yellow-700 text-sm space-y-1">
                    {!canCreateProposal && <li>• Insufficient voting power</li>}
                    {needsDelegation && <li>• Need to delegate voting power first</li>}
                    {!formData.title.trim() && <li>• Title is required</li>}
                    {!formData.body.trim() && <li>• Description is required</li>}
                    {!formData.forumThreadId && <li>• Forum thread is required</li>}
                    {!formData.selectedToken && <li>• Token selection is required</li>}
                    {isDelegating && <li>• Delegation in progress</li>}
                    {validationError && <li>• Validation error: {validationError}</li>}
                    {(!proposalArgs || proposalArgs[0].length === 0) && <li>• Invalid proposal arguments</li>}
                  </ul>
                </div>
              )}

              {isConnected && canCreateProposal ? (
                <Transaction
                  chainId={base.id} // Use base.id for Base
                  calls={[proposeCall]}
                  isSponsored={true}
                  onStatus={(status) => {
                    if (status.statusName === 'buildingTransaction') {
                      handleDelegationStart();
                    }
                  }}
                  onSuccess={async (txResult) => {
                    setHasInteracted(false);
                    if (hasProcessedProposal === txResult?.transactionReceipts?.[0]?.transactionHash) {
                      return;
                    }
                    setHasProcessedProposal(txResult?.transactionReceipts?.[0]?.transactionHash || null);
                    toast({ title: '✅ Proposal Created!', description: '' });
                    // --- Begin polling for proposal state ---
                    const transactionHash = txResult?.transactionReceipts?.[0]?.transactionHash;
                    const logs = txResult?.transactionReceipts?.[0]?.logs || [];
                    let realProposalId: string | null = null;
                    try {
                      const eventAbi = parseAbiItem(
                        'event ProposalCreatedWithMetadata(uint256 proposalId, address proposer, string title, string forumThreadId, uint256 createdAt)'
                      );
                      const parsedLogs = parseEventLogs({
                        abi: [eventAbi],
                        logs: logs,
                      });
                      for (const parsed of parsedLogs) {
                        if (parsed.eventName === 'ProposalCreatedWithMetadata') {
                          realProposalId = parsed.args.proposalId.toString();
                          break;
                        }
                      }
                      if (!realProposalId) {
                        const fallbackEventAbi = parseAbiItem(
                          'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)'
                        );
                        const fallbackParsedLogs = parseEventLogs({
                          abi: [fallbackEventAbi],
                          logs: logs,
                        });
                        for (const parsed of fallbackParsedLogs) {
                          if (parsed.eventName === 'ProposalCreated') {
                            realProposalId = parsed.args.proposalId.toString();
                            break;
                          }
                        }
                      }
                    } catch (e) {
                      console.error('Error parsing logs for proposal events:', e);
                    }
                    if (!realProposalId) {
                      realProposalId = transactionHash ? `temp_${transactionHash.slice(2, 10)}` : null;
                    }
                    // --- Insert metadata and notifications immediately ---
                    if (realProposalId) {
                      try {
                        // Check if proposal metadata already exists
                        const { data: existingMetadata } = await supabase
                          .from('proposal_metadata')
                          .select('id')
                          .eq('onchain_proposal_id', realProposalId)
                          .single();

                        if (!existingMetadata) {
                          // Extract mentions from the proposal body
                          const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
                          const mentions: string[] = [];
                          let match;
                          while ((match = mentionRegex.exec(formData.body)) !== null) {
                            mentions.push(match[2]); // match[2] is the wallet address
                          }
                          // Insert proposal metadata with status: 'active'
                          const { error: metadataError } = await supabase.from('proposal_metadata').insert([
                            {
                              onchain_proposal_id: realProposalId,
                              title: formData.title,
                              description: formData.body,
                              proposer_address: address,
                              forum_thread_id: formData.forumThreadId,
                              token_id: formData.selectedToken,
                              created_at: new Date().toISOString(),
                              transaction_hash: transactionHash,
                              mentions: mentions, // Store the mentions array
                              status: 'active', // Always set to active for new proposals
                            }
                          ]);
                          if (metadataError) {
                            console.error('❌ Error inserting proposal metadata:', metadataError);
                          }
                        }
                        // Create notifications for token holders if a token is selected
                        if (formData.selectedToken) {
                          try {
                            await governanceNotificationService.createTokenHolderNotifications(
                              formData.selectedToken,
                              address!,
                              realProposalId,
                              formData.title,
                              transactionHash
                            );
                          } catch (tokenNotificationError) {
                            console.error('❌ Error creating token holder notifications:', tokenNotificationError);
                          }
                        }
                        // Handle mentions in the proposal description
                        const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
                        const mentions: string[] = [];
                        let match;
                        while ((match = mentionRegex.exec(formData.body)) !== null) {
                          mentions.push(match[2]); // match[2] is the wallet address
                        }
                        // Create notifications for mentioned users
                        for (const mentionedAddress of mentions) {
                          try {
                            await governanceNotificationService.createProposalMentionNotification(
                              mentionedAddress,
                              address!,
                              realProposalId,
                              formData.title,
                              transactionHash
                            );
                          } catch (mentionError) {
                            console.error(`❌ Error creating mention notification for ${mentionedAddress}:`, mentionError);
                          }
                        }
                        // --- Ensure notification is sent ---
                        try {
                          await governanceNotificationService.createProposalCreatedNotification(
                            address!,
                            realProposalId,
                            formData.title,
                            transactionHash
                          );
                        } catch (notifErr) {
                          console.error('Error creating proposal created notification:', notifErr);
                        }
                        // --- End notification logic ---
                      } catch (error) {
                        console.error('❌ Error in post-transaction processing:', error);
                      }
                    }
                    // --- Poll for proposal state ---
                    if (realProposalId) {
                      let attempts = 0;
                      const maxAttempts = 15; // ~30 seconds
                      const poll = async () => {
                        try {
                          const state = await publicClient.readContract({
                            address: GOVERNOR_ADDRESS,
                            abi: DAOGovernorABI,
                            functionName: 'state',
                            args: [BigInt(realProposalId)],
                          });
                          if (state === 1) {
                            // Active
                            onSuccess?.();
                            setTimeout(() => {
                              refreshNotifications();
                              window.location.reload();
                            }, 500);
                            return;
                          }
                        } catch (err) {
                          // Ignore errors, keep polling
                        }
                        attempts++;
                        if (attempts < maxAttempts) {
                          setTimeout(poll, 2000);
                        } else {
                          // Give up after maxAttempts, just refresh
                          onSuccess?.();
                          setTimeout(() => {
                            refreshNotifications();
                            window.location.reload();
                          }, 500);
                        }
                      };
                      poll();
                    } else {
                      // Could not get proposalId, fallback
                      onSuccess?.();
                      setTimeout(() => {
                        refreshNotifications();
                        window.location.reload();
                      }, 500);
                    }
                    // --- End polling logic ---
                  }}
                  onError={(error) => {
                    console.error('❌ Proposal Transaction Error:', error.message);
                    toast({
                      title: 'Proposal Failed',
                      description: error.message || 'Unknown error',
                      variant: 'destructive',
                    });
                  }}
                >
                  <TransactionButton
                    className="w-full font-semibold py-4 px-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl !bg-[#d7f8fd] !text-black"
                    disabled={!canSubmitProposal}
                    text={isDelegating ? "Delegating..." : "Submit Proposal to DAO"}
                  />
                  <TransactionSponsor />
                  <div className="mt-4">
                    <TransactionStatus>
                      <TransactionStatusLabel />
                      <TransactionStatusAction />
                    </TransactionStatus>
                  </div>
                </Transaction>
              ) : (
                <div className="text-center">
                  <button
                    disabled
                    className="w-full bg-gray-300 text-gray-500 font-semibold py-4 px-8 rounded-lg cursor-not-allowed"
                  >
                    {!isConnected ? 'Connect Wallet to Submit' : 'Requirements Not Met'}
                  </button>
                </div>
              )}


            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateProposalForm;
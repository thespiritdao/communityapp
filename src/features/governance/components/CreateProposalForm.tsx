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
import { ProposalThreadSelector } from 'src/features/governance/components/ProposalThreadSelector';
import { useToast } from 'src/components/ui/use-toast';
import { createPublicClient, http } from 'viem';

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;

console.log('🔍 Environment Check:');
console.log('GOVERNOR_ADDRESS:', GOVERNOR_ADDRESS, typeof GOVERNOR_ADDRESS);
console.log('ADVOCATE_ADDRESS:', ADVOCATE_ADDRESS, typeof ADVOCATE_ADDRESS);

const RATE_LIMIT_MODE = true;
const BASE_CHAIN_ID = 8453;

if (!GOVERNOR_ADDRESS || !ADVOCATE_ADDRESS) {
  throw new Error('Missing contract addresses');
}

interface ProposalFormData {
  title: string;
  body: string;
  forumThreadId: string;
}

interface CreateProposalFormProps {
  onSuccess?: () => void;
}

// Helper function to validate BigInt values
const validateBigIntArray = (values: any[], fieldName: string): bigint[] => {
  console.log(`🔍 Validating ${fieldName}:`, values);
  
  if (!Array.isArray(values)) {
    console.error(`❌ ${fieldName} is not an array:`, values);
    throw new Error(`${fieldName} must be an array`);
  }
  
  return values.map((value, index) => {
    console.log(`🔍 Validating ${fieldName}[${index}]:`, value, typeof value);
    
    if (value === null || value === undefined) {
      console.error(`❌ ${fieldName}[${index}] is null/undefined`);
      throw new Error(`${fieldName}[${index}] cannot be null or undefined`);
    }
    
    if (typeof value === 'bigint') {
      console.log(`✅ ${fieldName}[${index}] is already BigInt:`, value.toString());
      return value;
    }
    
    if (typeof value === 'number') {
      if (isNaN(value) || !isFinite(value)) {
        console.error(`❌ ${fieldName}[${index}] is NaN or infinite:`, value);
        throw new Error(`${fieldName}[${index}] cannot be NaN or infinite`);
      }
      const bigIntValue = BigInt(value);
      console.log(`🔄 Converted ${fieldName}[${index}] from number to BigInt:`, value, '->', bigIntValue.toString());
      return bigIntValue;
    }
    
    if (typeof value === 'string') {
      if (value.trim() === '' || value === 'NaN') {
        console.error(`❌ ${fieldName}[${index}] is empty string or 'NaN':`, value);
        throw new Error(`${fieldName}[${index}] cannot be empty or 'NaN'`);
      }
      try {
        const bigIntValue = BigInt(value);
        console.log(`🔄 Converted ${fieldName}[${index}] from string to BigInt:`, value, '->', bigIntValue.toString());
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
  console.log(`🔍 Validating ${fieldName}:`, addresses);
  
  if (!Array.isArray(addresses)) {
    console.error(`❌ ${fieldName} is not an array:`, addresses);
    throw new Error(`${fieldName} must be an array`);
  }
  
  return addresses.map((address, index) => {
    console.log(`🔍 Validating ${fieldName}[${index}]:`, address, typeof address);
    
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
    
    console.log(`✅ ${fieldName}[${index}] is valid:`, address);
    return address as `0x${string}`;
  });
};

// Helper function to validate calldata arrays
const validateCalldataArray = (calldatas: any[], fieldName: string): `0x${string}`[] => {
  console.log(`🔍 Validating ${fieldName}:`, calldatas);
  
  if (!Array.isArray(calldatas)) {
    console.error(`❌ ${fieldName} is not an array:`, calldatas);
    throw new Error(`${fieldName} must be an array`);
  }
  
  return calldatas.map((calldata, index) => {
    console.log(`🔍 Validating ${fieldName}[${index}]:`, calldata, typeof calldata);
    
    if (typeof calldata !== 'string') {
      console.error(`❌ ${fieldName}[${index}] is not a string:`, typeof calldata, calldata);
      throw new Error(`${fieldName}[${index}] must be a string`);
    }
    
    if (!calldata.startsWith('0x')) {
      console.error(`❌ ${fieldName}[${index}] doesn't start with 0x:`, calldata);
      throw new Error(`${fieldName}[${index}] must start with 0x`);
    }
    
    console.log(`✅ ${fieldName}[${index}] is valid:`, calldata);
    return calldata as `0x${string}`;
  });
};

export const CreateProposalForm: React.FC<CreateProposalFormProps> = ({ onSuccess }) => {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState<ProposalFormData>({
    title: 'Test Proposal',
    body: 'This is a test proposal for debugging gas estimation issues',
    forumThreadId: 'test-123',
    targets: [],
    values: [],
    calldatas: [],
  });

  const [debugMode, setDebugMode] = useState(true);
  const [isDelegating, setIsDelegating] = useState(false);
  const [delegationTxHash, setDelegationTxHash] = useState<`0x${string}` | undefined>();
  const [validationError, setValidationError] = useState<string | null>(null);

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
    transport: http('https://mainnet.base.org'),
  });

	// Handle delegation transaction completion
	useEffect(() => {
	  if (isDelegationSuccess && delegationTxHash) {
		console.log('Delegation transaction confirmed:', delegationTxHash);
		
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

  // Determine delegation needs with enhanced logic
  const needsDelegation = React.useMemo(() => {
    if (!address || !nftBalance || !votingPower || !currentDelegate) {
      return false; // Don't show delegation if data isn't loaded
    }

    const hasNFTs = BigInt(nftBalance.toString()) > 0n;
    const hasVotingPower = BigInt(votingPower.toString()) > 0n;
    const isNotDelegated = currentDelegate === '0x0000000000000000000000000000000000000000' ||
      currentDelegate.toLowerCase() !== address.toLowerCase();

    return hasNFTs && (!hasVotingPower || isNotDelegated);
  }, [address, nftBalance, votingPower, currentDelegate]);

  // Enhanced delegation handlers
  const handleDelegationStart = () => {
    console.log('Starting delegation process...');
    setIsDelegating(true);
  };

  const handleDelegationSuccess = (transactionHash: `0x${string}`) => {
    console.log('Delegation transaction submitted:', transactionHash);
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

  // Form handlers
  const handleFormChange = (field: keyof ProposalFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear validation error when form changes
    if (validationError) {
      setValidationError(null);
    }
  };

  // Check if user can create proposals
	const canCreateProposal = React.useMemo(() => {
	  // ✅ Add explicit null/undefined checks
	  if (!votingPower || !proposalThreshold || 
		  votingPower === undefined || proposalThreshold === undefined) {
		return false;
	  }
	  
	  try {
		return BigInt(votingPower.toString()) >= BigInt(proposalThreshold.toString());
	  } catch (error) {
		console.error('BigInt conversion error:', error);
		return false;
	  }
	}, [votingPower, proposalThreshold]);

  // ENHANCED: Memoized proposal arguments with comprehensive validation and logging
	const proposalArgs = React.useMemo(() => {
	  console.log('🚀 === PROPOSAL ARGS PREPARATION START ===');
	  // These are always valid, so we can construct directly
	  
	   // Validate environment variables first
	  if (!ADVOCATE_ADDRESS || ADVOCATE_ADDRESS === 'undefined') {
		throw new Error('ADVOCATE_ADDRESS is not defined');
	  }
		  
	  
	  const targets = [ADVOCATE_ADDRESS];
	  const values = [0n];
	  const calldatas = [encodeFunctionData({
		abi: AdvocateMembershipABI,
		functionName: "name",
		args: [],
	  })];
	  
	    console.log('Pre-validation:');
		  console.log('targets:', targets, 'types:', targets.map(t => typeof t));
		  console.log('values:', values, 'types:', values.map(v => typeof v));
		  console.log('calldatas:', calldatas, 'types:', calldatas.map(c => typeof c));
	  
	  const description = `# ${formData.title}\n\n${formData.body}${formData.forumThreadId ? `\n\nForum: ${formData.forumThreadId}` : ''}`;
	  try {
		setValidationError(null);

		// Check required fields (title/body)
		if (!formData.title?.trim()) throw new Error('Title is required and cannot be empty');
		if (!formData.body?.trim()) throw new Error('Body is required and cannot be empty');
		if (targets.length !== values.length || targets.length !== calldatas.length) {
		  throw new Error(`Array length mismatch: targets(${targets.length}), values(${values.length}), calldatas(${calldatas.length})`);
		}

		// Log the constructed values for debug
		console.log('  📍 targets:', targets);
		console.log('  💰 values:', values.map(v => v.toString()));
		console.log('  📞 calldatas:', calldatas);
		console.log('  📝 description length:', description.length);

		return [
		  targets,
		  values,
		  calldatas,
		  description,
		] as const;
	  } catch (error) {
		console.error('❌ === PROPOSAL ARGS PREPARATION FAILED ===');
		console.error('Error:', error);
		setValidationError(error instanceof Error ? error.message : 'Unknown validation error');
		// Return safe defaults so the component doesn't crash (but this proposal will fail to send)
		return [
		  targets,
		  values,
		  calldatas,
		  description,
		  formData.title,
		  formData.forumThreadId || "no-forum",
		] as const;
	  }
	}, [formData, ADVOCATE_ADDRESS, AdvocateMembershipABI]);


  // Enhanced validation for submit button
  const canSubmitProposal = React.useMemo(() => {
    console.log('🔒 === SUBMIT VALIDATION CHECK ===');
    
    const checks = {
      canCreateProposal,
      needsDelegation: !needsDelegation,
      hasTitle: formData.title.trim().length > 0,
      hasBody: formData.body.trim().length > 0,
      notDelegating: !isDelegating,
      noValidationError: !validationError,
      argsValid: proposalArgs && proposalArgs[0].length > 0 && proposalArgs[1].length > 0
    };
    
    console.log('Submit validation checks:', checks);
    
    const canSubmit = Object.values(checks).every(Boolean);
    console.log('Can submit proposal:', canSubmit);
    
    return canSubmit;
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
  
  console.log('🔍 Final Args Pre-Transaction:', {
  governor: GOVERNOR_ADDRESS,
  advocate: ADVOCATE_ADDRESS,
  args: proposalArgs,
  argsTypes: proposalArgs.map((arg, i) => `${i}: ${typeof arg} ${Array.isArray(arg) ? `[${arg.length}]` : ''}`),
});

console.log('[DEBUG] Transaction call:', {
  contract: GOVERNOR_ADDRESS,
  abi: DAOGovernorABI,
  functionName: 'propose',
  args: proposalArgs,
});

console.log("🚨 FINAL proposalArgs", proposalArgs);
console.log("typeof proposalArgs[0][0]", typeof proposalArgs[0][0]);
console.log("typeof proposalArgs[1][0]", typeof proposalArgs[1][0], proposalArgs[1][0]);
console.log("typeof proposalArgs[2][0]", typeof proposalArgs[2][0]);
console.log("typeof proposalArgs[3]", typeof proposalArgs[3], proposalArgs[3]);


console.log("[ARGS DUMP]");
console.log("targets (Array):", proposalArgs[0], proposalArgs[0].map((t,i)=>[i,typeof t, t, t.length]));
console.log("values  (Array):", proposalArgs[1], proposalArgs[1].map((v,i)=>[i,typeof v, v, v.toString?.()]));
console.log("calldatas (Array):", proposalArgs[2], proposalArgs[2].map((c,i)=>[i,typeof c, c, c.length]));
console.log("description (String):", proposalArgs[3], typeof proposalArgs[3], proposalArgs[3].length);


console.log("[ACTUAL TX ARGS] Will send:", {
  args: [
    ['0x592E560171D2a882474cdfc3BbeeDb21cEB4015d'],
    [0n],
    ['0x06fdde03'],
    "# Test Proposal\n\nThis is a test proposal for debugging gas estimation issues\n\nForum: test-123"
  ],
  proposalArgs,
  types: proposalArgs.map(arg =>
    Array.isArray(arg)
      ? arg.map(v => [typeof v, v])
      : [typeof arg, arg]
  ),
});

proposalArgs.forEach((arg, idx) => {
  if (Array.isArray(arg)) {
    arg.forEach((v, i) => {
      console.log(`[CHECK] args[${idx}][${i}]:`, v, typeof v, v === undefined, Number.isNaN(v));
    });
  } else {
    console.log(`[CHECK] args[${idx}]:`, arg, typeof arg, arg === undefined, Number.isNaN(arg));
  }
});

  const proposeCall = {
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'propose',
    args: proposalArgs,
  };

  return (
    <div className="proposal-form p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Create a New Proposal</h2>
      
      {/* Validation Error Display */}
      {validationError && (
        <div className="p-4 border-2 border-red-300 bg-red-50 rounded-lg mb-6">
          <h3 className="font-semibold text-red-800 mb-2">❌ Validation Error</h3>
          <p className="text-sm text-red-700">{validationError}</p>
        </div>
      )}
      
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Connection Status */}
        <div className="p-4 border rounded-lg">
          <h3 className="font-semibold text-green-600 mb-2">✓ Connected</h3>
          <div className="text-sm text-gray-600">
            <div>Address: {address?.slice(0, 6)}...{address?.slice(-4)}</div>
            <div>Chain: Base ({chainId})</div>
            <div>Wallet: {connector?.name || 'Unknown'}</div>
          </div>
        </div>
        
        {/* Voting Power Status */}
        <div className={`p-4 border rounded-lg ${canCreateProposal ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <h3 className={`font-semibold mb-2 ${canCreateProposal ? 'text-green-600' : 'text-red-600'}`}>
            {canCreateProposal ? '✓ Can Create Proposals' : '✗ Insufficient Voting Power'}
          </h3>
          <div className="text-sm">
            <div>NFT Balance: {isLoadingBalance ? 'Loading...' : nftBalance?.toString() || '0'}</div>
            <div>Voting Power: {isLoadingVotingPower ? 'Loading...' : votingPower?.toString() || '0'}</div>
            <div>Required: {isLoadingThreshold ? 'Loading...' : proposalThreshold?.toString() || '1'}</div>
            <div>Delegate: {currentDelegate?.slice(0, 6)}...{currentDelegate?.slice(-4) || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Enhanced Delegation Section */}
      {needsDelegation && (
        <div className="p-4 border-2 border-yellow-300 bg-yellow-50 rounded-lg mb-6">
          <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Delegation Required</h3>
          <p className="text-sm text-yellow-700 mb-3">
            You own {nftBalance?.toString()} NFT(s) but need to delegate voting power to yourself to create proposals.
          </p>
          
          {isDelegating && (
            <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              {isDelegationPending ? '⏳ Waiting for transaction confirmation...' : '🔄 Delegation in progress...'}
            </div>
          )}
          
          <div className="flex flex-col space-y-2">
            <Transaction
              isSponsored
              address={address}
              contracts={[{
                address: ADVOCATE_ADDRESS,
                abi: AdvocateMembershipABI,
                functionName: 'delegate',
                args: [address as `0x${string}`], // Explicit type casting to ensure it's not undefined
                gas: 150000n, // Increased gas limit
              }]}
              onSuccess={(result) => {
                if (result.transactionReceipts?.[0]?.transactionHash) {
                  handleDelegationSuccess(result.transactionReceipts[0].transactionHash as `0x${string}`);
                }
              }}
              onError={handleDelegationError}
              onTransactionStarted={handleDelegationStart}
            >
              <TransactionButton
                text={isDelegating ? "Delegating..." : "Delegate Voting Power to Myself"}
                disabled={isDelegating || !address}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
              />
            </Transaction>
            <div className="text-xs text-yellow-600">
              This transaction will delegate your NFT voting power to yourself, enabling you to vote and create proposals.
              {address && <div className="mt-1">Delegating to: {address}</div>}
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

      {/* Form */}
      <form onSubmit={e => e.preventDefault()} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">
            Proposal Title *
          </label>
          <input
            id="title"
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.title}
            onChange={e => handleFormChange('title', e.target.value)}
            required
            placeholder="Enter a clear, descriptive title"
          />
        </div>
        <div>
          <label htmlFor="body" className="block text-sm font-medium mb-1">
            Proposal Description *
          </label>
          <textarea
            id="body"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={formData.body}
            onChange={e => handleFormChange('body', e.target.value)}
            required
            rows={6}
            placeholder="Provide a detailed description of your proposal"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Forum Discussion (Optional)
          </label>
          <ProposalThreadSelector
            onThreadSelect={threadId => handleFormChange('forumThreadId', threadId)}
          />
          {formData.forumThreadId && (
            <p className="mt-1 text-sm text-gray-600">
              Selected: {formData.forumThreadId}
            </p>
          )}
        </div>
        
        {/* Submit Button with Enhanced Validation */}
        <div className="pt-4">
          {/* Show specific blocking reasons */}
          {!canSubmitProposal && (
            <div className="mb-4 p-3 border border-orange-300 bg-orange-50 rounded-lg">
              <h4 className="font-semibold text-orange-800 mb-2">Cannot Submit Proposal:</h4>
              <ul className="text-sm text-orange-700 space-y-1">
                {!canCreateProposal && <li>• Insufficient voting power</li>}
                {needsDelegation && <li>• Need to delegate voting power first</li>}
                {!formData.title.trim() && <li>• Title is required</li>}
                {!formData.body.trim() && <li>• Description is required</li>}
                {isDelegating && <li>• Delegation in progress</li>}
                {validationError && <li>• Validation error: {validationError}</li>}
                {(!proposalArgs || proposalArgs[0].length === 0) && <li>• Invalid proposal arguments</li>}
              </ul>
            </div>
          )}	  
		  

		<Transaction
		  address={address?.toLowerCase() as `0x${string}`}
		  chainId={BASE_CHAIN_ID}
		  calls={[proposeCall]}
		  onTransactionStarted={() =>
			console.log('🔔 Proposal tx starting:', proposalArgs)
		  }
		  onSuccess={() => {
			toast({ title: '✅ Proposal Created!', description: '' });
			onSuccess?.();
		  }}
		  onError={(error) => {
			console.error('❌ Proposal error', error);
			toast({
			  title: 'Proposal Failed',
			  description: error.message || 'Unknown error',
			  variant: 'destructive',
			});
		  }}
		>
		  <TransactionButton
			text="Create Proposal"
			disabled={!canSubmitProposal}
			className={`w-full py-3 rounded ${
			  canSubmitProposal
				? 'bg-blue-600 hover:bg-blue-700 text-white'
				: 'bg-gray-400 text-gray-600 cursor-not-allowed'
			}`}
		  />
		  <TransactionSponsor />
		  <TransactionStatus>
			<TransactionStatusLabel />
			<TransactionStatusAction />
		  </TransactionStatus>
		</Transaction>
        </div>
      </form>
    </div>
  );
};

export default CreateProposalForm;
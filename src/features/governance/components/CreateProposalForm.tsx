'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  useChainId,
  useReadContract,
  useBlockNumber,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useSendUserOperation, useCurrentUser, useEvmAddress } from '@coinbase/cdp-hooks';
import { useQueryClient } from '@tanstack/react-query';
import { base } from 'viem/chains';
import { encodeFunctionData, type Abi } from 'viem';
import AdvocateMembershipABIJson from '@/abis/AdvocateMembershipABI.json';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';
import { ProposalThreadSelector } from './ProposalThreadSelector';

const AdvocateMembershipABI = AdvocateMembershipABIJson as Abi;
const DAOGovernorABI = DAOGovernorABIJson as Abi;
import { useToast } from '@/components/ui/use-toast';
import { createPublicClient, http } from 'viem';
import { useForum } from '@/features/forum/hooks/useForum';
import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import {
  getUserIdentity,
  canParticipateInGovernance,
  logUserIdentity,
} from '@/utils/accessControlUtils';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useGovernancePermission } from '@/hooks/useGovernancePermission';
import UserTagging from '@/components/UserTagging';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';
import { votingReminderService } from '@/services/votingReminderService';
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
        console.error(
          `❌ ${fieldName}[${index}] is empty string or 'NaN':`,
          value,
        );
        throw new Error(`${fieldName}[${index}] cannot be empty or 'NaN'`);
      }
      try {
        const bigIntValue = BigInt(value);
        return bigIntValue;
      } catch (error) {
        console.error(
          `❌ Failed to convert ${fieldName}[${index}] string to BigInt:`,
          value,
          error,
        );
        throw new Error(
          `${fieldName}[${index}] '${value}' is not a valid integer`,
        );
      }
    }

    console.error(
      `❌ ${fieldName}[${index}] has unsupported type:`,
      typeof value,
      value,
    );
    throw new Error(
      `${fieldName}[${index}] has unsupported type: ${typeof value}`,
    );
  });
};

// Helper function to validate address arrays
const validateAddressArray = (
  addresses: any[],
  fieldName: string,
): `0x${string}`[] => {
  if (!Array.isArray(addresses)) {
    console.error(`❌ ${fieldName} is not an array:`, addresses);
    throw new Error(`${fieldName} must be an array`);
  }

  return addresses.map((address, index) => {
    if (typeof address !== 'string') {
      console.error(
        `❌ ${fieldName}[${index}] is not a string:`,
        typeof address,
        address,
      );
      throw new Error(`${fieldName}[${index}] must be a string`);
    }

    if (!address.startsWith('0x')) {
      console.error(
        `❌ ${fieldName}[${index}] doesn't start with 0x:`,
        address,
      );
      throw new Error(`${fieldName}[${index}] must start with 0x`);
    }

    if (address.length !== 42) {
      console.error(
        `❌ ${fieldName}[${index}] has wrong length:`,
        address.length,
        address,
      );
      throw new Error(`${fieldName}[${index}] must be 42 characters long`);
    }

    return address as `0x${string}`;
  });
};

// Helper function to validate calldata arrays
const validateCalldataArray = (
  calldatas: any[],
  fieldName: string,
): `0x${string}`[] => {
  if (!Array.isArray(calldatas)) {
    console.error(`❌ ${fieldName} is not an array:`, calldatas);
    throw new Error(`${fieldName} must be an array`);
  }

  return calldatas.map((calldata, index) => {
    if (typeof calldata !== 'string') {
      console.error(
        `❌ ${fieldName}[${index}] is not a string:`,
        typeof calldata,
        calldata,
      );
      throw new Error(`${fieldName}[${index}] must be a string`);
    }

    if (!calldata.startsWith('0x')) {
      console.error(
        `❌ ${fieldName}[${index}] doesn't start with 0x:`,
        calldata,
      );
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
    data: {} as any,
  };
  try {
    validation.data = JSON.parse(
      JSON.stringify(data, (key, value) => {
        if (typeof value === 'bigint') {
          return value.toString();
        }
        return value;
      }),
    );
    if (!validation.data.address) validation.issues.push('Missing address');
    if (!validation.data.chainId) validation.issues.push('Missing chainId');
    if (!validation.data.calls) validation.issues.push('Missing calls');
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

export function CreateProposalForm({
  onSuccess,
}: CreateProposalFormProps): React.ReactElement {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { evmAddress: address } = useEvmAddress();
  const chainId = useChainId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userHats, permissions: hatPermissions, userRoles } = useHatPermissions();

  // Check wallet connection status
  const isConnected = Boolean(currentUser && address);

  // ✅ FIXED: Check governance participation permission for SPECIFIC pods, not global
  // Use pod-specific permissions instead of consolidated permissions to prevent bypass
  const podsWithGovernancePermission = React.useMemo(() => {
    return (userRoles || [])
      .filter(role => role.permissions?.governanceParticipation === true && role.podId)
      .map(role => role.podId);
  }, [userRoles]);

  // User can create proposals if they have governance permission in at least one pod
  const hasGovernancePermission = podsWithGovernancePermission.length > 0;

  console.log('🏛️ Governance Permission Check:', {
    address,
    isConnected,
    hasGovernancePermission,
    podsWithGovernance: podsWithGovernancePermission.length,
    userRolesCount: userRoles?.length || 0,
  });

  const [formData, setFormData] = useState<ProposalFormData>({
    title: '',
    body: '',
    forumThreadId: '',
    selectedToken: '',
  });
  const [userTokens, setUserTokens] = useState<{ id: string; label: string }[]>(
    [],
  );
  const { loadPosts } = useForum();
  const { refreshNotifications } = useUnifiedNotifications();

  const [debugMode, setDebugMode] = useState(true);
  const [isDelegating, setIsDelegating] = useState(false);
  const [delegationTxHash, setDelegationTxHash] = useState<
    `0x${string}` | undefined
  >();
  const [validationError, setValidationError] = useState<string | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [governanceAccess, setGovernanceAccess] = useState<boolean | null>(
    null,
  ); // null = loading, boolean = result
  const [hasProcessedProposal, setHasProcessedProposal] = useState<
    string | null
  >(null);
  const [submissionStatus, setSubmissionStatus] = useState<string>('');

  // Check governance access when wallet connects
  useEffect(() => {
    const checkGovernanceAccess = async () => {
      if (!address || !isConnected) {
        setGovernanceAccess(false);
        return;
      }

      try {
        // Fetch token balances
        const tokenBalances = await fetchTokenBalances(address);

        // Get user identity
        const identity = await getUserIdentity(
          address,
          tokenBalances,
          userHats,
        );
        logUserIdentity(identity, 'Governance Access Check');

        // Check if user can participate in governance
        const canParticipate = canParticipateInGovernance(identity);
        console.log(`🗳️ User can participate in governance: ${canParticipate}`);

        setGovernanceAccess(canParticipate);
      } catch (error) {
        console.error('Error checking governance access:', error);
        setGovernanceAccess(false);
      }
    };

    checkGovernanceAccess();
  }, [address, isConnected, userHats]);

  // Get the latest block number (Base chain)
  const { data: latestBlock } = useBlockNumber();

  // Wait for delegation transaction confirmation
  const { isLoading: isDelegationPending, isSuccess: isDelegationSuccess } =
    useWaitForTransactionReceipt({
      hash: delegationTxHash,
      confirmations: 2, // Wait for 2 confirmations on Base
    });

  // Read NFT balance with more robust error handling
  const {
    data: nftBalance,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
    error: balanceError,
  } = useReadContract({
    address: ADVOCATE_ADDRESS,
    abi: AdvocateMembershipABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!ADVOCATE_ADDRESS && isConnected,
      staleTime: 60000, // ✅ 1 minute
      gcTime: 120000, // ✅ 2 minutes
      retry: (failureCount, error) => {
        if (
          error?.message?.includes('429') ||
          error?.message?.includes('rate limit')
        ) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  });

  // Robust Voting Power Hooks
  const {
    data: votingPower,
    refetch: refetchVotingPower,
    isLoading: isLoadingVotingPower,
    error: votingPowerError,
  } = useReadContract({
    address: ADVOCATE_ADDRESS,
    abi: AdvocateMembershipABI,
    functionName: 'getVotes',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!ADVOCATE_ADDRESS && isConnected,
      refetchInterval: false, // ✅ Disable automatic refetching to reduce calls
      staleTime: 60000, // ✅ 1 minute - data stays fresh longer
      gcTime: 120000, // ✅ 2 minutes - keep in cache longer
      retry: (failureCount, error) => {
        // Don't retry on rate limit errors
        if (
          error?.message?.includes('429') ||
          error?.message?.includes('rate limit')
        ) {
          return false;
        }
        return failureCount < 2; // Only retry twice for other errors
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
    },
  });

  // Check current delegate with better error handling
  const {
    data: currentDelegate,
    refetch: refetchDelegate,
    error: delegateError,
  } = useReadContract({
    address: ADVOCATE_ADDRESS,
    abi: AdvocateMembershipABI,
    functionName: 'delegates',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!ADVOCATE_ADDRESS && isConnected,
      staleTime: 60000, // ✅ 1 minute
      gcTime: 120000, // ✅ 2 minutes
      retry: (failureCount, error) => {
        if (
          error?.message?.includes('429') ||
          error?.message?.includes('rate limit')
        ) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    },
  });

  // Get proposal threshold
  const { data: proposalThreshold, isLoading: isLoadingThreshold } =
    useReadContract({
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'proposalThreshold',
      query: {
        enabled: !!GOVERNOR_ADDRESS && isConnected,
      },
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
          refetchBalance(),
        ]);

        setIsDelegating(false);
        setDelegationTxHash(undefined);

        toast({
          title: 'Delegation Successful!',
          description:
            'Your voting power is now active. You can create proposals.',
        });
      }, 3000);
    }
  }, [
    isDelegationSuccess,
    delegationTxHash,
    queryClient,
    refetchVotingPower,
    refetchDelegate,
    refetchBalance,
    toast,
  ]); // ❌ Removed votingPowerQueryKey from dependencies

  // ✅ Load user's pods with governance permission from database (not hardcoded)
  useEffect(() => {
    async function loadUserPodsWithGovernance() {
      if (!address) return;

      try {
        console.log('🗳️ Loading pods where user has governanceParticipation permission...');

        const tokens: { id: string; label: string }[] = [];
        const addedPodIds = new Set<string>(); // Track to avoid duplicates

        // ✅ SECURITY FIX: Only load pods where user has governanceParticipation permission
        // Removed pod_leads bypass that allowed proposal creation without permission check
        for (const role of userRoles || []) {
          if (role.permissions?.governanceParticipation && role.podId) {
            const { data: pod } = await supabase
              .from('pods')
              .select('name')
              .eq('id', role.podId)
              .single();

            if (pod && !addedPodIds.has(role.podId)) {
              tokens.push({
                id: role.podId,
                label: pod.name,
              });
              addedPodIds.add(role.podId);
              console.log(`  ✅ Added pod with governance permission: ${pod.name}`);
            }
          } else if (role.podId) {
            // Log pods where user does NOT have governance permission
            const { data: pod } = await supabase
              .from('pods')
              .select('name')
              .eq('id', role.podId)
              .single();
            if (pod) {
              console.log(`  ⚠️ Skipped pod (no governance permission): ${pod.name}`);
            }
          }
        }

        console.log(`📋 Total pods with governance permission: ${tokens.length}`);
        setUserTokens(tokens);
      } catch (error) {
        console.error('❌ Error loading user pods with governance permission:', error);
        setUserTokens([]);
      }
    }

    loadUserPodsWithGovernance();
  }, [address, userRoles]);

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
      const delegateAddress = currentDelegate as string | undefined;
      const isDelegatedToSelf =
        delegateAddress &&
        delegateAddress.toLowerCase() === address.toLowerCase();
      return !isDelegatedToSelf;
    }

    // If we have NFTs but no voting power, we need delegation
    return true;
  }, [
    address,
    nftBalance,
    votingPower,
    currentDelegate,
    isLoadingBalance,
    isLoadingVotingPower,
  ]);

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
      errorMessage =
        'Invalid address parameter. Please try refreshing the page.';
    } else if (error.shortMessage) {
      errorMessage = error.shortMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }

    toast({
      title: 'Delegation Failed',
      description: errorMessage,
      variant: 'destructive',
    });
  };

  // CDP transaction handler for delegation
  const handleCDPDelegation = useCallback(async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      toast({
        title: 'Error',
        description: 'Smart Account not found',
        variant: 'destructive',
      });
      return;
    }

    if (!address) {
      toast({
        title: 'Error',
        description: 'No address to delegate to',
        variant: 'destructive',
      });
      return;
    }

    handleDelegationStart();

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];

      const callData = encodeFunctionData({
        abi: AdvocateMembershipABI,
        functionName: 'delegate',
        args: [address],
      });

      console.log('🚀 CDP Delegation:', {
        smartAccount,
        delegateTo: address,
      });

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: ADVOCATE_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Delegation submitted:', result);

      // Use userOperationHash as transaction hash
      if (result.userOperationHash) {
        handleDelegationSuccess(result.userOperationHash as `0x${string}`);
      }

      toast({
        title: 'Delegation Submitted',
        description: 'Your voting power delegation is being processed (gasless).',
        variant: 'success',
      });
    } catch (error: any) {
      handleDelegationError(error);
    }
  }, [currentUser, address, sendUserOperation, toast]);

  // Handler for thread selection
  const handleThreadSelect = async (threadId: string) => {
    setFormData((prev) => ({ ...prev, forumThreadId: threadId }));
    if (threadId) {
      const result = await loadPosts(threadId, 0, 1);
      if (result.success && result.posts && result.posts.length > 0) {
        setFormData((prev) => ({ ...prev, body: result.posts[0].content }));
      }
    }
  };

  // Form handlers
  const handleFormChange = (field: keyof ProposalFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasInteracted(true);
    // Clear validation error when form changes
    if (validationError) {
      setValidationError(null);
    }
  };

  // Check voting power separately so we can show specific error messages
  const hasVotingPower = React.useMemo(() => {
    // ✅ BETA TESTING: If user has governance permission from HATs, bypass voting power check
    // This allows Beta Testers to create proposals without Advocate NFTs
    if (hasGovernancePermission) {
      console.log('✅ Voting power check bypassed - user has governanceParticipation permission');
      return true;
    }

    // Normal flow: Check Advocate NFT voting power
    if (votingPower === undefined || votingPower === null || proposalThreshold === undefined || proposalThreshold === null) {
      return false;
    }

    try {
      const votingPowerBigInt = BigInt(votingPower.toString());
      const thresholdBigInt = BigInt(proposalThreshold.toString());
      return votingPowerBigInt >= thresholdBigInt;
    } catch (error) {
      console.error('BigInt conversion error:', error);
      return false;
    }
  }, [votingPower, proposalThreshold, hasGovernancePermission]);

  // Check if user can create proposals
  const canCreateProposal = React.useMemo(() => {
    // ✅ FIX: Must have BOTH governance permission AND voting power
    // (Note: Beta Testers automatically pass voting power check via HAT permissions)

    // Check permission first
    if (!hasGovernancePermission) {
      console.log(
        '❌ Cannot create proposal: No governanceParticipation permission',
      );
      return false;
    }

    // Then check voting power (automatically true for users with governance permission)
    if (!hasVotingPower) {
      console.log('❌ Cannot create proposal: Insufficient voting power');
      return false;
    }

    console.log('✅ Can create proposal: Has permission AND voting power');
    return true;
  }, [hasGovernancePermission, hasVotingPower]);

  // ENHANCED: Memoized proposal arguments with comprehensive validation and logging
  const proposalArgs = React.useMemo(() => {
    const targets = [ADVOCATE_ADDRESS];
    const values = [0n];
    const calldatas = [
      encodeFunctionData({
        abi: AdvocateMembershipABI,
        functionName: 'name',
        args: [],
      }),
    ];

    const description = `# ${formData.title}\n\n${formData.body}${formData.forumThreadId ? `\n\nForum: ${formData.forumThreadId}` : ''}`;
    try {
      setValidationError(null);

      // Only validate if user has actually started filling out the form and the form is not empty
      if (hasInteracted && (formData.title || formData.body)) {
        if (!formData.title?.trim())
          throw new Error('Title is required and cannot be empty');
        if (!formData.body?.trim())
          throw new Error('Body is required and cannot be empty');
      }
      if (
        targets.length !== values.length ||
        targets.length !== calldatas.length
      ) {
        throw new Error(
          `Array length mismatch: targets(${targets.length}), values(${values.length}), calldatas(${calldatas.length})`,
        );
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
        setValidationError(
          error instanceof Error ? error.message : 'Unknown validation error',
        );
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
      argsValid:
        proposalArgs &&
        proposalArgs[0].length > 0 &&
        proposalArgs[1].length > 0,
    };

    const canSubmit = Object.values(checks).every(Boolean);

    return canSubmit && !!formData.forumThreadId && !!formData.selectedToken;
  }, [
    canCreateProposal,
    needsDelegation,
    formData.title,
    formData.body,
    isDelegating,
    validationError,
    proposalArgs,
  ]);

  // ❌ REMOVED EARLY RETURNS - they violated Rules of Hooks by returning after hooks were called
  // Now we handle these cases in the JSX render instead

  const proposeCall = {
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposeWithMetadata',
    args: [...proposalArgs] as unknown as any[], // flatten tuple to array to avoid deep type recursion
  };

  // Helper function to wait for receipt and extract real proposal ID
  const waitForProposalConfirmation = async (
    userOpHash: string,
    tempProposalId: string,
    proposalTitle: string,
    proposalBody: string,
    proposerAddress: string,
    forumThreadId?: string,
  ): Promise<string | null> => {
    try {
      console.log('\n========================================');
      console.log('🔄 PROPOSAL CONFIRMATION DIAGNOSTICS');
      console.log('========================================');
      console.log('   UserOperationHash:', userOpHash);
      console.log('   Temporary ID:', tempProposalId);
      console.log('   Proposer Address:', proposerAddress);
      console.log('   Title:', proposalTitle);
      console.log('   Body (first 100 chars):', proposalBody.substring(0, 100));

      // Create public client for Base
      const publicClient = createPublicClient({
        chain: base,
        transport: http(),
      });

      const currentBlock = await publicClient.getBlockNumber();
      console.log('   Current Block:', currentBlock);

      // Try to check if the transaction exists at all
      console.log('\n🔍 STEP 1: Checking if UserOperation transaction exists...');
      try {
        const tx = await publicClient.getTransaction({
          hash: userOpHash as `0x${string}`,
        });
        if (tx) {
          console.log('✅ Transaction found on-chain!');
          console.log('   Block Number:', tx.blockNumber);
          console.log('   From:', tx.from);
          console.log('   To:', tx.to);
          console.log('   Status:', tx.blockNumber ? 'Mined' : 'Pending');
        }
      } catch (txError: any) {
        console.log('⚠️ Transaction not found by userOperationHash:', txError.message);
        console.log('   This is expected for ERC-4337 transactions (hash mismatch)');
      }

      // APPROACH 1: Try to get receipt by userOperationHash (may work if hash matches)
      console.log('\n🔍 STEP 2: Attempting direct receipt lookup (5s timeout)...');
      let receipt;
      try {
        receipt = await publicClient.waitForTransactionReceipt({
          hash: userOpHash as `0x${string}`,
          timeout: 5_000, // Only wait 5 seconds instead of 30
        });
        console.log('✅ Receipt found! Block:', receipt.blockNumber);
        console.log('   Transaction Hash:', receipt.transactionHash);
        console.log('   Status:', receipt.status);

        // Parse ProposalCreated event from logs
        const proposalCreatedAbi = parseAbiItem(
          'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)',
        );

        const logs = parseEventLogs({
          abi: [proposalCreatedAbi],
          logs: receipt.logs,
        });

        if (logs.length > 0) {
          const realProposalId = logs[0].args.proposalId?.toString();
          if (realProposalId) {
            // Success via receipt lookup
            await supabase
              .from('proposal_metadata')
              .update({
                onchain_proposal_id: realProposalId,
                transaction_hash: receipt.transactionHash,
              })
              .eq('onchain_proposal_id', tempProposalId);

            console.log('✅ Proposal metadata updated successfully');
            toast({
              title: '✅ Proposal Confirmed!',
              description: `Proposal #${realProposalId} is now live on-chain`,
            });

            return realProposalId;
          }
        }
      } catch (waitError: any) {
        console.warn('⚠️ Direct receipt lookup failed (expected for ERC-4337):', waitError.message);
        console.log('🔄 Proceeding to event query method (the reliable approach)...');
      }

      // APPROACH 2: Query on-chain events directly (handles ERC-4337 hash mismatch)
      console.log('\n🔍 STEP 3: Querying blockchain for ProposalCreated events...');
      console.log('   Governor Contract:', GOVERNOR_ADDRESS);

      // Wait 3 seconds for ERC-4337 bundler to process transaction
      console.log('   ⏳ Waiting 3 seconds for bundler to process transaction...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('   ✅ Wait complete, querying events...');

      // Get latest block number (transactions may have been mined during the wait)
      const latestBlock = await publicClient.getBlockNumber();
      const fromBlock = latestBlock - 100n; // Look back ~5 minutes
      console.log('   Latest Block:', latestBlock);
      console.log('   Scanning blocks:', fromBlock, 'to', latestBlock, `(${100n} blocks)`);

      const proposalCreatedAbi = parseAbiItem(
        'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)',
      );

      console.log('   Event ABI:', proposalCreatedAbi.name);

      let logs;
      try {
        logs = await publicClient.getLogs({
          address: GOVERNOR_ADDRESS,
          event: proposalCreatedAbi,
          fromBlock,
          toBlock: latestBlock,
        });
        console.log(`✅ Query successful! Found ${logs.length} recent ProposalCreated events`);
      } catch (logError: any) {
        console.error('❌ Failed to query logs:', logError.message);
        console.error('   Full error:', logError);
        return null;
      }

      if (logs.length === 0) {
        console.log('⚠️ No ProposalCreated events found in the last 100 blocks');
        console.log('   This suggests the proposal transaction may not have been executed yet');
        console.log('   OR the transaction failed');
        console.log('   OR we\'re looking at the wrong contract address');
        return null;
      }

      // Build expected description format (MUST match the format used when creating the proposal)
      const expectedDescription = `# ${proposalTitle}\n\n${proposalBody}${forumThreadId ? `\n\nForum: ${forumThreadId}` : ''}`;

      console.log('   📋 Expected description includes forum ID:', !!forumThreadId);
      if (forumThreadId) {
        console.log('   📋 Forum Thread ID:', forumThreadId);
      }

      // Normalize function for comparison (handles whitespace differences)
      const normalizeDescription = (desc: string) => {
        return desc
          .trim()
          .replace(/\s+/g, ' ')  // Collapse multiple spaces
          .replace(/\n\s+/g, '\n')  // Remove leading spaces from lines
          .toLowerCase();
      };

      const normalizedExpected = normalizeDescription(expectedDescription);

      console.log('\n🔍 STEP 4: Matching proposal by proposer + description...');
      console.log('   Expected Proposer:', proposerAddress.toLowerCase());
      console.log('   Expected Description Length:', expectedDescription.length);
      console.log('   Expected Description (first 150 chars):');
      console.log('   "' + expectedDescription.substring(0, 150).replace(/\n/g, '\\n') + '..."');
      console.log('   Normalized Expected Length:', normalizedExpected.length);
      console.log('   Normalized Expected (first 150 chars):');
      console.log('   "' + normalizedExpected.substring(0, 150).replace(/\n/g, '\\n') + '..."');

      // Find matching proposal
      console.log(`\n📝 Checking ${logs.length} events for match...`);
      for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        const parsed = parseEventLogs({
          abi: [proposalCreatedAbi],
          logs: [log],
        })[0];

        const logProposer = (parsed.args.proposer as string)?.toLowerCase();
        const logDescription = parsed.args.description as string;
        const proposalId = parsed.args.proposalId?.toString();

        const normalizedLogDescription = normalizeDescription(logDescription || '');
        const exactMatch = logDescription === expectedDescription;
        const normalizedMatch = normalizedLogDescription === normalizedExpected;

        const proposerMatches = logProposer === proposerAddress.toLowerCase();

        console.log(`\n   ═══════════════════════════════════════`);
        console.log(`   Event ${i + 1}/${logs.length}:`);
        console.log('   ───────────────────────────────────────');
        console.log('     Proposal ID:', proposalId);
        console.log('     Block:', log.blockNumber);
        console.log('     Transaction Hash:', log.transactionHash);
        console.log('   ───────────────────────────────────────');
        console.log('     Proposer:', logProposer);
        console.log('     Proposer Match:', proposerMatches ? '✅ YES' : '❌ NO');
        console.log('   ───────────────────────────────────────');
        console.log('     Description Length:', logDescription?.length || 0);
        console.log('     Description (first 150 chars):');
        console.log('     "' + (logDescription?.substring(0, 150).replace(/\n/g, '\\n') || '') + '..."');
        console.log('   ───────────────────────────────────────');
        console.log('     Normalized Length:', normalizedLogDescription.length);
        console.log('     Normalized (first 150 chars):');
        console.log('     "' + normalizedLogDescription.substring(0, 150).replace(/\n/g, '\\n') + '..."');
        console.log('   ───────────────────────────────────────');
        console.log('     Exact Match:', exactMatch ? '✅ YES' : '❌ NO');
        console.log('     Normalized Match:', normalizedMatch ? '✅ YES' : '❌ NO');

        if (!exactMatch && !normalizedMatch && proposerMatches) {
          console.log('   ───────────────────────────────────────');
          console.log('     🔍 PROPOSER MATCHES BUT DESCRIPTION DIFFERS');
          console.log('     Comparing character by character (first 200):');
          const maxLen = Math.max(expectedDescription.length, (logDescription?.length || 0));
          for (let j = 0; j < Math.min(maxLen, 200); j++) {
            const expectedChar = expectedDescription[j] || '(end)';
            const logChar = (logDescription || '')[j] || '(end)';
            if (expectedChar !== logChar) {
              console.log(`       Position ${j}: Expected "${expectedChar}" (code ${expectedChar.charCodeAt(0)}) vs Got "${logChar}" (code ${logChar.charCodeAt(0)})`);
            }
          }
        }

        if (logProposer === proposerAddress.toLowerCase() && (exactMatch || normalizedMatch)) {
          const realProposalId = proposalId;

          console.log('\n========================================');
          console.log('✅ MATCH FOUND!');
          console.log('========================================');
          console.log('   Real Proposal ID:', realProposalId);
          console.log('   Transaction Hash:', log.transactionHash);
          console.log('   Block Number:', log.blockNumber);

          // Update database
          const { error: updateError } = await supabase
            .from('proposal_metadata')
            .update({
              onchain_proposal_id: realProposalId,
              transaction_hash: log.transactionHash,
            })
            .eq('onchain_proposal_id', tempProposalId);

          if (updateError) {
            console.error('❌ Failed to update database:', updateError);
          } else {
            console.log('✅ Proposal metadata updated successfully in database');
          }

          toast({
            title: '✅ Proposal Confirmed!',
            description: `Proposal #${realProposalId} is now live on-chain`,
          });

          return realProposalId;
        }
      }

      console.log('\n========================================');
      console.log('⏳ NO MATCH FOUND');
      console.log('========================================');
      console.log('   Checked', logs.length, 'events but none matched');
      console.log('   Possible reasons:');
      console.log('   1. Transaction still pending (not yet mined)');
      console.log('   2. Transaction failed (check wallet/bundler)');
      console.log('   3. Description format mismatch');
      console.log('   4. Wrong contract address');
      console.log('   Will retry automatically in background polling');
      console.log('========================================\n');
      return null;
    } catch (error: any) {
      console.error('\n========================================');
      console.error('❌ ERROR IN CONFIRMATION PROCESS');
      console.error('========================================');
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.error('========================================\n');
      return null;
    }
  };

  // CDP transaction handler for proposal creation
  const handleCDPProposalCreation = useCallback(async () => {
    if (!currentUser?.evmSmartAccounts?.[0] || !proposalArgs) {
      toast({
        title: 'Error',
        description: 'Cannot create proposal - missing required data',
        variant: 'destructive',
      });
      return;
    }

    // ✅ SECURITY: Validate that user has governance permission in the selected pod
    const selectedPodId = formData.selectedToken;
    if (selectedPodId && !podsWithGovernancePermission.includes(selectedPodId)) {
      console.error('❌ Authorization failed: User does not have governance permission in selected pod', {
        selectedPod: selectedPodId,
        allowedPods: podsWithGovernancePermission,
      });
      toast({
        title: 'Authorization Error',
        description: 'You do not have governance participation permission in the selected pod',
        variant: 'destructive',
      });
      return;
    }

    // ✅ ARCHITECTURE FIX: Determine proposal type
    // - Executive Pod → DAO-wide on-chain proposal (Executive Pod votes)
    // - Other pods → Pod-level off-chain proposal (pod members vote)
    const EXEC_POD_ID = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;
    const isPodLevelProposal = selectedPodId && selectedPodId !== EXEC_POD_ID;

    console.log('🏛️ [PROPOSAL TYPE]', {
      selectedPod: selectedPodId,
      execPodId: EXEC_POD_ID,
      isPodLevel: isPodLevelProposal,
      type: isPodLevelProposal ? 'Pod-Level (off-chain)' : 'DAO-Wide (on-chain)',
    });

    if (isPodLevelProposal) {
      // ✅ CREATE POD-LEVEL PROPOSAL (off-chain, pod-specific voting)
      try {
        setSubmissionStatus('🔄 Creating pod-level proposal...');

        const proposalId = await GovernanceService.createPodLevelProposal({
          title: formData.title,
          description: formData.body,
          pod_id: selectedPodId,
          created_by: address!,
          metadata: {
            forum_thread_id: formData.forumThreadId,
            choices: ['For', 'Against', 'Abstain'],
          },
        });

        setSubmissionStatus('✅ Pod-level proposal created!');

        toast({
          title: '✅ Proposal Created!',
          description: `Pod-level proposal created. Only ${userTokens.find(t => t.id === selectedPodId)?.label} members with governance permission can vote.`,
        });

        // Reset form
        setFormData({
          title: '',
          body: '',
          forumThreadId: '',
          selectedToken: '',
        });

        setSubmissionStatus('');
        setHasInteracted(false);

        // Trigger refetch
        if (onProposalCreated) {
          onProposalCreated();
        }

        return; // Exit early - pod-level proposal complete
      } catch (error: any) {
        console.error('❌ Failed to create pod-level proposal:', error);
        toast({
          title: 'Proposal Creation Failed',
          description: error.message || 'Failed to create pod-level proposal',
          variant: 'destructive',
        });
        setSubmissionStatus('');
        return;
      }
    }

    // ✅ CREATE DAO-WIDE PROPOSAL (on-chain, Executive Pod voting)
    const smartAccount = currentUser.evmSmartAccounts[0];

    try {
      setSubmissionStatus('🔄 Preparing transaction...');

      // Encode the proposal call
      const callData = encodeFunctionData({
        abi: DAOGovernorABI,
        functionName: 'proposeWithMetadata',
        args: proposalArgs,
      });

      console.log('🚀 CDP Proposal Creation:', {
        smartAccount,
        args: proposalArgs,
        callData,
        targetContract: GOVERNOR_ADDRESS,
      });

      setSubmissionStatus('📡 Submitting to blockchain...');

      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: GOVERNOR_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: true,
      });

      console.log('✅ Proposal submitted:', result);
      console.log('🔑 UserOperation Hash:', result.userOperationHash);
      console.log('📝 Smart Account:', smartAccount);

      // Process success (extracted from OnchainKit onSuccess)
      setHasInteracted(false);
      const txHash = result.userOperationHash;

      if (hasProcessedProposal === txHash) {
        return;
      }
      setHasProcessedProposal(txHash || null);

      setSubmissionStatus('✅ Transaction submitted! Creating proposal metadata...');

      toast({
        title: '✅ Proposal Submitted!',
        description: 'Waiting for blockchain confirmation...'
      });

      // Capture form data values before resetting (for use in async callbacks)
      const proposalTitle = formData.title;
      const proposalBody = formData.body;
      const proposalTokenId = formData.selectedToken;
      const proposalForumThreadId = formData.forumThreadId;

      // Reset form
      setFormData({
        title: '',
        body: '',
        forumThreadId: '',
        selectedToken: '',
      });

      // Use a temporary ID based on the user operation hash
      const tempProposalId = txHash ? `temp_${txHash.slice(2, 10)}` : null;
      console.log('🆔 Temporary Proposal ID:', tempProposalId);

      if (tempProposalId && txHash) {
        try {
          // Check if proposal metadata already exists
          const { data: existingMetadata, error: checkError } = await supabase
            .from('proposal_metadata')
            .select('id')
            .eq('onchain_proposal_id', tempProposalId)
            .maybeSingle();

          // Only insert if no existing metadata found
          if (!existingMetadata && !checkError) {
            // Extract mentions from the proposal body
            const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
            const mentions: string[] = [];
            let match;
            while ((match = mentionRegex.exec(proposalBody)) !== null) {
              mentions.push(match[2]);
            }

            // Insert proposal metadata with temporary ID
            const { error: metadataError } = await supabase
              .from('proposal_metadata')
              .insert([{
                onchain_proposal_id: tempProposalId, // Temporary ID
                title: proposalTitle,
                description: proposalBody,
                proposer_address: address,
                forum_thread_id: proposalForumThreadId,
                token_id: proposalTokenId,
                created_at: new Date().toISOString(),
                transaction_hash: txHash,
                mentions: mentions,
                status: 'active',
              }]);

            if (metadataError) {
              console.error('❌ Error inserting proposal metadata:', metadataError);
            } else {
              console.log('✅ Proposal metadata created with temporary ID:', tempProposalId);
            }
          }

          setSubmissionStatus('⏳ Waiting for blockchain confirmation (this may take 30-60 seconds)...');

          // Wait for on-chain confirmation and update with real ID
          // This runs in the background - don't await it
          waitForProposalConfirmation(
            txHash,
            tempProposalId,
            proposalTitle,
            proposalBody,
            address!,
            proposalForumThreadId, // Pass forum thread ID so we can match the exact description format
          ).then((realProposalId) => {
            if (realProposalId) {
              setSubmissionStatus('✅ Proposal confirmed on-chain! Sending notifications...');

              // Send token holder notifications with real ID
              if (proposalTokenId) {
                votingReminderService.notifyTokenHoldersOfNewProposal(
                  realProposalId,
                  proposalTitle,
                  address!,
                ).then(() => {
                  console.log('✅ Token holder notifications sent');
                  setSubmissionStatus('✅ Proposal created successfully!');
                  setTimeout(() => setSubmissionStatus(''), 3000);
                }).catch((err) => {
                  console.error('❌ Error creating token holder notifications:', err);
                  setSubmissionStatus('⚠️ Proposal created but notification failed');
                  setTimeout(() => setSubmissionStatus(''), 5000);
                });
              } else {
                setSubmissionStatus('✅ Proposal created successfully!');
                setTimeout(() => setSubmissionStatus(''), 3000);
              }

              // Refresh proposals list to show confirmed proposal
              onSuccess?.();
            } else {
              setSubmissionStatus('⏳ Proposal pending confirmation - will update automatically');
              setTimeout(() => setSubmissionStatus(''), 5000);
              console.log('⏳ Proposal remains in pending state - will be confirmed later');
            }
          }).catch((err) => {
            console.error('❌ Error in confirmation process:', err);
            setSubmissionStatus('⚠️ Confirmation check failed - proposal may still be processing');
            setTimeout(() => setSubmissionStatus(''), 5000);
          });

          console.log('✅ Proposal submitted with temporary ID - confirmation in progress');
        } catch (error) {
          console.error('❌ Error in post-transaction processing:', error);
          setSubmissionStatus('❌ Error processing proposal');
          setTimeout(() => setSubmissionStatus(''), 5000);
        }
      }

      // Refresh and reload immediately (will show pending proposal)
      onSuccess?.();
      setTimeout(() => {
        refreshNotifications();
        // Don't reload the page - it logs users out
        // Just refresh the proposals list via onSuccess callback
      }, 2000);

    } catch (error: any) {
      console.error('❌ Proposal Transaction Error:', error.message);
      console.error('Full error:', error);
      setSubmissionStatus('❌ Transaction failed');
      setTimeout(() => setSubmissionStatus(''), 5000);
      toast({
        title: 'Proposal Failed',
        description: error.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [currentUser, proposalArgs, sendUserOperation, formData, address, toast, hasProcessedProposal, onSuccess, refreshNotifications, podsWithGovernancePermission]);

  // Validate transaction data before rendering Transaction
  const transactionData = {
    address: address?.toLowerCase() as `0x${string}`,
    chainId: base.id, // Use base.id for Base
    calls: [proposeCall],
    isSponsored: true,
  };
  const validation = validateTransactionData(transactionData);
  if (validation.isValid) {
    // Transaction data validated successfully
  } else {
    console.error('Invalid transaction data:', validation.issues);
  }

  // ✅ Handle error states in render instead of early returns
  if (!isConnected || !address) {
    return (
      <div className="proposal-form p-6">
        <h2 className="text-2xl font-bold mb-4">Create a New Proposal</h2>
        <div className="mb-4" style={{ color: '#8B3A3A' }}>
          Please connect your wallet to create proposals.
        </div>
      </div>
    );
  }

  if (chainId !== base.id) {
    return (
      <div className="proposal-form p-6">
        <h2 className="text-2xl font-bold mb-4">Create a New Proposal</h2>
        <div className="mb-4" style={{ color: '#8B3A3A' }}>
          Please switch to Base network. Currently on chain ID: {chainId}
        </div>
      </div>
    );
  }

  if (!GOVERNOR_ADDRESS || !ADVOCATE_ADDRESS) {
    return (
      <div className="proposal-form p-6">
        <h2 className="text-2xl font-bold mb-4">Create a New Proposal</h2>
        <div className="mb-4" style={{ color: '#8B3A3A' }}>
          Missing contract addresses in environment variables.
        </div>
      </div>
    );
  }

  return (
    <div className="py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-8">

            {validationError ? (
              <div
                className="mb-6 p-4 rounded-lg"
                style={{
                  backgroundColor: '#F5E6E6',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: '#D9B3B3',
                }}
              >
                <h4 className="font-medium mb-2" style={{ color: '#5C1F1F' }}>
                  Validation Error
                </h4>
                <p className="text-sm" style={{ color: '#8B3A3A' }}>
                  {validationError}
                </p>
              </div>
            ) : null}

            <div
              className="mb-8 p-6 rounded-lg"
              style={{
                backgroundColor: '#E8F1EE',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: '#B8D9CA',
              }}
            >
              <h4 className="font-semibold mb-3" style={{ color: '#1F453A' }}>
                📋 Requirements
              </h4>
              <div
                className="grid md:grid-cols-2 gap-4 text-sm"
                style={{ color: '#2F5D50' }}
              >
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span
                      className="w-2 h-2 rounded-full mr-2"
                      style={{
                        backgroundColor:
                          nftBalance !== undefined && nftBalance !== null && BigInt(String(nftBalance)) > 0n
                            ? '#3F7A5A'
                            : '#8B3A3A',
                      }}
                    />
                    Verified Member
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span
                      className="w-2 h-2 rounded-full mr-2"
                      style={{
                        backgroundColor:
                          nftBalance !== undefined && nftBalance !== null && BigInt(String(nftBalance)) > 0n
                            ? '#3F7A5A'
                            : '#8B3A3A',
                      }}
                    />
                    Role w/ Governance Permissions
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <span
                      className="w-2 h-2 rounded-full mr-2"
                      style={{
                        backgroundColor:
                          formData.title.length >= 10 ? '#3F7A5A' : '#C6933F',
                      }}
                    />
                    Clear, descriptive title
                  </div>
                  <div className="flex items-center">
                    <span
                      className="w-2 h-2 rounded-full mr-2"
                      style={{
                        backgroundColor:
                          formData.body.length >= 50 ? '#3F7A5A' : '#C6933F',
                      }}
                    />
                    Detailed description (50+ chars)
                  </div>
                </div>
              </div>
            </div>


            {needsDelegation && (
              <div
                className="mb-6 p-4 rounded-lg"
                style={{
                  backgroundColor: '#FAF4EC',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: '#E8D7B8',
                }}
              >
                <div className="flex items-center">
                  <div className="w-5 h-5 mr-3" style={{ color: '#C6933F' }}>
                    ⚠️
                  </div>
                  <p className="font-medium" style={{ color: '#8F6B2F' }}>
                    Delegation Required
                  </p>
                </div>
                <p className="text-sm mt-2" style={{ color: '#C6933F' }}>
                  You own {nftBalance?.toString()} NFT(s) but need to delegate
                  voting power to yourself to create proposals.
                </p>

                {isDelegating && (
                  <div
                    className="mb-3 p-2 rounded text-sm"
                    style={{
                      backgroundColor: '#E8F1EE',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: '#B8D9CA',
                      color: '#2F5D50',
                    }}
                  >
                    {isDelegationPending
                      ? '⏳ Waiting for transaction confirmation...'
                      : '🔄 Delegation in progress...'}
                  </div>
                )}

                <div className="flex flex-col space-y-2">
                  <button
                    onClick={handleCDPDelegation}
                    disabled={isDelegating || !address}
                    className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors bg-[#C6933F] hover:bg-[#8F6B2F]"
                  >
                    {isDelegating
                      ? 'Delegating...'
                      : 'Delegate Voting Power to Myself (Gasless)'}
                  </button>
                  <div className="text-xs" style={{ color: '#C6933F' }}>
                    This transaction will delegate your NFT voting power to
                    yourself, enabling you to vote and create proposals.
                    {address && (
                      <div className="mt-1">Delegating to: {address}</div>
                    )}
                  </div>
                </div>
              </div>
            )}


            {!needsDelegation &&
              nftBalance &&
              BigInt(nftBalance.toString()) > 0n &&
              (!votingPower || BigInt(votingPower.toString()) === 0n) ? (
                <div
                  className="mb-6 p-4 rounded-lg"
                  style={{
                    backgroundColor: '#F5E6E6',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: '#D9B3B3',
                  }}
                >
                  <div className="flex items-center">
                    <div className="w-5 h-5 mr-3" style={{ color: '#8B3A3A' }}>
                      🚨
                    </div>
                    <p className="font-medium" style={{ color: '#5C1F1F' }}>
                      Voting Power Issue Detected
                    </p>
                  </div>
                  <p className="text-sm mt-2" style={{ color: '#8B3A3A' }}>
                    You own {nftBalance.toString()} NFT(s) but have{' '}
                    {votingPower?.toString() || '0'} voting power. This may be
                    due to a contract redeployment. Please delegate your voting
                    power.
                  </p>

                  <div className="flex flex-col space-y-2">
                    <button
                      onClick={async () => {
                        await handleCDPDelegation();
                        // Force refetch after delegation
                        setTimeout(() => {
                          refetchVotingPower();
                          refetchDelegate();
                          refetchBalance();
                        }, 3000);
                      }}
                      disabled={isDelegating || !address}
                      className="w-full disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors bg-[#8B3A3A] hover:bg-[#5C1F1F]"
                    >
                      {isDelegating ? 'Delegating...' : 'Force Delegate Voting Power (Gasless)'}
                    </button>
                    <div className="text-xs" style={{ color: '#8B3A3A' }}>
                      This will delegate your voting power to yourself. This
                      is needed after contract redeployments.
                    </div>
                  </div>
                </div>
              ) : null}


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
                <div>Wallet: CDP Smart Account</div>
                <div>NFT Balance: {nftBalance?.toString() || 'N/A'}</div>
                <div>Voting Power: {votingPower?.toString() || 'N/A'}</div>
                <div>
                  Proposal Threshold: {proposalThreshold?.toString() || 'N/A'}
                </div>
                <div>Current Delegate: {currentDelegate ? String(currentDelegate) : 'N/A'}</div>
                <div>Needs Delegation: {needsDelegation ? 'Yes' : 'No'}</div>
                <div className="font-bold" style={{ color: '#2F5D50' }}>
                  Has Governance Permission:{' '}
                  {hasGovernancePermission ? 'Yes ✅' : 'No ❌'}
                </div>
                <div className="font-bold" style={{ color: '#2F5D50' }}>
                  Has Voting Power: {hasVotingPower ? 'Yes ✅' : 'No ❌'}
                </div>
                <div>
                  Can Create Proposal: {canCreateProposal ? 'Yes' : 'No'}
                </div>
                <div>
                  Can Submit Proposal: {canSubmitProposal ? 'Yes' : 'No'}
                </div>
                <div>Is Delegating: {isDelegating ? 'Yes' : 'No'}</div>
                <div>Delegation Tx: {delegationTxHash || 'N/A'}</div>
                <div>
                  Delegation Pending: {isDelegationPending ? 'Yes' : 'No'}
                </div>
                <div>Validation Error: {validationError || 'None'}</div>
                <div>
                  Proposal Args Length: targets={proposalArgs[0].length},
                  values={proposalArgs[1].length}, calldatas=
                  {proposalArgs[2].length}
                </div>
                <div>
                  Proposal Values: [
                  {proposalArgs[1].map((v) => v.toString()).join(', ')}]
                </div>
                <div>
                  Proposal Value Types: [
                  {proposalArgs[1].map((v) => typeof v).join(', ')}]
                </div>
                {balanceError && (
                  <div style={{ color: '#8B3A3A' }}>
                    Balance Error: {balanceError.message}
                  </div>
                )}
                {votingPowerError && (
                  <div style={{ color: '#8B3A3A' }}>
                    Voting Power Error: {votingPowerError.message}
                  </div>
                )}
                {delegateError && (
                  <div style={{ color: '#8B3A3A' }}>
                    Delegate Error: {delegateError.message}
                  </div>
                )}
              </div>
            </details>


            <div className="space-y-6">

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Link Forum Discussion
                </label>
                <ProposalThreadSelector onThreadSelect={handleThreadSelect} />
                {!formData.forumThreadId && (
                  <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                    Forum thread is required.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="title"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Proposal Title *
                </label>
                <input
                  id="title"
                  type="text"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-colors"
                  style={
                    {
                      '--tw-ring-color': '#2F5D50',
                    } as React.CSSProperties
                  }
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 0 2px #2F5D50';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = '';
                  }}
                  value={formData.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  placeholder="Enter a clear, descriptive title for your proposal"
                  disabled={isDelegating}
                  maxLength={200}
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Make it clear and specific - this will be the main
                    identifier for your proposal
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.title.length}/200
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="body"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Proposal Description *
                </label>
                <UserTagging
                  value={formData.body}
                  onChange={(value) => handleFormChange('body', value)}
                  placeholder="Provide a detailed description of your proposal... Use @ to mention someone"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-colors resize-none"
                  style={
                    {
                      '--tw-ring-color': '#2F5D50',
                    } as React.CSSProperties
                  }
                  multiLine={true}
                  contextType="governance"
                  contextId="new-proposal"
                  contextUrl="/governance"
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Supports Markdown formatting. One paragraph summarizing the
                    proposal purpose and the impact.
                  </p>
                  <span className="text-xs text-gray-400">
                    {formData.body.length}/10,000
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="token"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  Accessible To (Pod/Token) *
                </label>
                <select
                  id="token"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-colors"
                  style={
                    {
                      '--tw-ring-color': '#2F5D50',
                    } as React.CSSProperties
                  }
                  onFocus={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 0 2px #2F5D50';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.boxShadow = '';
                  }}
                  value={formData.selectedToken}
                  onChange={(e) =>
                    handleFormChange('selectedToken', e.target.value)
                  }
                  required={true}
                >
                  <option value="">Select a token</option>
                  {userTokens.map((token) => (
                    <option key={token.id} value={token.id}>
                      {token.label}
                    </option>
                  ))}
                </select>
                {!formData.selectedToken && (
                  <p className="text-xs mt-1" style={{ color: '#8B3A3A' }}>
                    Token selection is required.
                  </p>
                )}
              </div>
            </div>


            <div className="mt-8 pt-6 border-t border-gray-200">

              {!canSubmitProposal && hasInteracted && (
                <div
                  className="mb-6 p-4 rounded-lg"
                  style={{
                    backgroundColor: '#FAF4EC',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: '#E8D7B8',
                  }}
                >
                  <h4 className="font-medium mb-2" style={{ color: '#8F6B2F' }}>
                    Cannot Submit Proposal:
                  </h4>
                  <ul
                    className="text-sm space-y-1"
                    style={{ color: '#C6933F' }}
                  >
                    {!hasGovernancePermission && (
                      <li>
                        •{' '}
                        <span className="font-semibold">
                          No governance participation permission
                        </span>
                        <br />
                        <span className="text-xs ml-4">
                          You need the "governanceParticipation" permission in
                          your pod role to create proposals
                        </span>
                      </li>
                    )}
                    {hasGovernancePermission && !hasVotingPower && (
                      <li>
                        •{' '}
                        <span className="font-semibold">
                          Insufficient voting power
                        </span>
                        <br />
                        <span className="text-xs ml-4">
                          You need more Advocate NFTs or voting tokens to meet
                          the proposal threshold
                        </span>
                      </li>
                    )}
                    {needsDelegation && (
                      <li>• Need to delegate voting power first</li>
                    )}
                    {!formData.title.trim() && <li>• Title is required</li>}
                    {!formData.body.trim() && (
                      <li>• Description is required</li>
                    )}
                    {!formData.forumThreadId && (
                      <li>• Forum thread is required</li>
                    )}
                    {!formData.selectedToken && (
                      <li>• Token selection is required</li>
                    )}
                    {isDelegating && <li>• Delegation in progress</li>}
                    {validationError && (
                      <li>• Validation error: {validationError}</li>
                    )}
                    {(!proposalArgs || proposalArgs[0].length === 0) && (
                      <li>• Invalid proposal arguments</li>
                    )}
                  </ul>
                </div>
              )}

              {isConnected && canCreateProposal ? (
                <>
                  <button
                    onClick={handleCDPProposalCreation}
                    disabled={!canSubmitProposal || submissionStatus !== ''}
                    className="w-full font-semibold py-4 px-8 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                    style={{
                      backgroundColor: '#2F5D50',
                      color: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#1F453A';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!e.currentTarget.disabled) {
                        e.currentTarget.style.backgroundColor = '#2F5D50';
                      }
                    }}
                  >
                    {isDelegating ? 'Delegating...' : 'Submit Proposal'}
                  </button>

                  {/* Submission Status Display */}
                  {submissionStatus && (
                    <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
                      <p className="text-sm text-blue-800 text-center font-medium">
                        {submissionStatus}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center">
                  <button
                    disabled={true}
                    className="w-full bg-gray-300 text-gray-500 font-semibold py-4 px-8 rounded-lg cursor-not-allowed"
                  >
                    {isConnected
                      ? 'Requirements Not Met'
                      : 'Connect Wallet to Submit'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreateProposalForm;

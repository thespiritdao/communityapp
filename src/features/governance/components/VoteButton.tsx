// src/features/governance/components/VoteButton.tsx
'use client';
import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';

const DAOGovernorABI = DAOGovernorABIJson as Abi;
import { useGovernancePermission } from '@/hooks/useGovernancePermission';

interface VoteButtonProps {
  proposalId: string; // BigInt as string to preserve precision for large proposal IDs
  choice: number;
  approvingPodId?: string; // Optional: which pod should approve (defaults to Executive Pod)
  onVoteSuccess?: () => void; // Callback to refetch proposals after voting
  hasVoted?: boolean; // Optional: pass from parent to avoid duplicate RPC calls
}

const BASE_CHAIN_ID = 8453;

const VoteButton: React.FC<VoteButtonProps> = ({
  proposalId,
  choice,
  approvingPodId,
  onVoteSuccess,
  hasVoted: hasVotedProp,
}) => {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSponsoredProcessing, setIsSponsoredProcessing] = useState(false);
  const [hasVotedState, setHasVotedState] = useState(false);
  const GOVERNOR_ADDRESS = process.env
    .NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;

  // ✅ ARCHITECTURE FIX: Check governance permission for correct pod
  // On-chain governance proposals typically require Executive Pod permission
  const { canParticipate: hasGovernancePermission } = useGovernancePermission(
    approvingPodId,
    'dao-wide',
  );

  // Use prop if provided, otherwise check via RPC
  const hasVoted = hasVotedProp !== undefined ? hasVotedProp : hasVotedState;

  // Check if user has already voted on this proposal
  // All buttons need to check to ensure they all hide when user votes
  useEffect(() => {
    // Skip if hasVoted was passed as prop
    if (hasVotedProp !== undefined) return;

    const checkIfVoted = async () => {
      if (!publicClient || !address || !proposalId) return;

      try {
        const voted = await publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'hasVoted',
          args: [BigInt(proposalId), address],
        }) as boolean;

        setHasVotedState(voted);
      } catch (error) {
        console.error('Error checking if user has voted:', error);
      }
    };

    checkIfVoted();
  }, [publicClient, address, proposalId, GOVERNOR_ADDRESS, hasVotedProp]);

  // CDP transaction handler (non-sponsored)
  // ⚠️ IMPORTANT: Must be defined BEFORE any conditional returns to avoid React hooks error
  const handleVote = useCallback(async (usePaymaster: boolean) => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      toast({
        title: 'Error',
        description: 'Smart Account not found',
        variant: 'destructive',
      });
      return;
    }

    const setLoading = usePaymaster ? setIsSponsoredProcessing : setIsProcessing;
    setLoading(true);

    try {
      console.log(
        `Attempting CDP vote on proposal ${proposalId} with choice ${choice}, paymaster: ${usePaymaster}`,
      );

      const smartAccount = currentUser.evmSmartAccounts[0];

      // Encode the vote call
      const callData = encodeFunctionData({
        abi: DAOGovernorABI,
        functionName: 'castVote',
        args: [BigInt(proposalId), Number(choice)],
      });

      console.log('Sending user operation:', {
        smartAccount,
        functionName: 'castVote',
        args: [proposalId, choice],
        usePaymaster,
      });

      // Send user operation
      const result = await sendUserOperation({
        evmSmartAccount: smartAccount,
        network: 'base',
        calls: [{
          to: GOVERNOR_ADDRESS,
          value: 0n,
          data: callData,
        }],
        useCdpPaymaster: usePaymaster,
      });

      console.log('✅ Vote submitted successfully:', result);

      // Update local state optimistically
      setHasVotedState(true);

      toast({
        title: 'Vote submitted',
        description: `Your vote was cast on-chain${usePaymaster ? ' (gasless)' : ''}!`,
        variant: 'success',
      });

      // Wait for blockchain confirmation, then refetch to update vote counts and hasVoted state
      setTimeout(() => {
        if (onVoteSuccess) {
          onVoteSuccess();
        }
      }, 4000); // 4 second delay to ensure blockchain processes the transaction
    } catch (error: any) {
      console.error('Vote transaction failed:', error);

      let errorMessage = 'Unknown error occurred';
      if (error.shortMessage) errorMessage = error.shortMessage;
      else if (error.message) errorMessage = error.message;

      toast({
        title: 'Vote failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentUser, proposalId, choice, sendUserOperation, GOVERNOR_ADDRESS, toast, onVoteSuccess]);

  // ✅ Check permission AFTER all hooks are defined
  if (!hasGovernancePermission) {
    return (
      <button
        disabled
        className="px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed"
        title="You do not have governance participation permission in the required pod"
      >
        Vote (No Permission)
      </button>
    );
  }

  // Map choice number to label
  const choiceLabels = ['For', 'Against', 'Abstain'];
  const choiceLabel = choiceLabels[choice - 1] || `Choice ${choice}`;

  // Get colors based on choice (matching SpiritDAO design system)
  const getChoiceColors = (choiceNum: number) => {
    switch (choiceNum) {
      case 1: // For
        return {
          bg: '#3F7A5A', // Success Green
          hover: '#2F5D50',
          processing: '#6B7280'
        };
      case 2: // Against
        return {
          bg: '#8B3A3A', // Earthen Red
          hover: '#5C1F1F',
          processing: '#6B7280'
        };
      case 3: // Abstain
        return {
          bg: '#6b7280', // Gray
          hover: '#4b5563',
          processing: '#6B7280'
        };
      default:
        return {
          bg: '#2F5D50',
          hover: '#1F453A',
          processing: '#6B7280'
        };
    }
  };

  const colors = getChoiceColors(choice);

  // ✅ If user has already voted, show message only once (for first button)
  // and hide the other buttons
  if (hasVoted) {
    if (choice === 1) {
      // Show message only for the first button
      return (
        <div className="w-full px-4 py-2 bg-gray-100 text-gray-600 rounded font-medium border border-gray-300 text-center">
          ✓ You have voted on this proposal
        </div>
      );
    }
    // Hide other buttons
    return null;
  }

  return (
    <button
      onClick={() => handleVote(true)}
      disabled={isSponsoredProcessing || !address}
      className={`px-4 py-2 text-white rounded font-medium transition-all duration-200 ${isSponsoredProcessing ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'}`}
      style={{
        backgroundColor: isSponsoredProcessing ? colors.processing : colors.bg,
      }}
      onMouseEnter={(e) => {
        if (!isSponsoredProcessing)
          e.currentTarget.style.backgroundColor = colors.hover;
      }}
      onMouseLeave={(e) => {
        if (!isSponsoredProcessing)
          e.currentTarget.style.backgroundColor = colors.bg;
      }}
    >
      {isSponsoredProcessing ? 'Processing...' : choiceLabel}
    </button>
  );
};

export default VoteButton;

// src/features/governance/components/VoteButton.tsx
'use client';
import type React from 'react';
import { useState, useCallback, useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import type { Abi } from 'viem';
import { encodeFunctionData } from 'viem';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/wallet/hooks/useSendUserOperationWithAttribution';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';

const DAOGovernorABI = DAOGovernorABIJson as Abi;
import { useGovernancePermission } from '@/hooks/useGovernancePermission';

interface VoteButtonProps {
  proposalId: string; // BigInt as string to preserve precision for large proposal IDs
  choice: number;
  approvingPodId?: string; // Optional: which pod should approve (defaults to Executive Pod)
  onVoteSuccess?: () => void; // Callback to refetch proposals after voting
  hasVoted?: boolean; // Optional: pass from parent to avoid duplicate RPC calls
  voteCounts?: { for: number; against: number; abstain: number }; // Optional: trigger re-check when counts change
  isAdvocateGated?: boolean; // DAO_CONSTITUTIONAL: any Advocate ERC-721 holder can vote
  userCanVote?: boolean; // Pre-computed from useEnhancedProposals — skip local permission check
}

const BASE_CHAIN_ID = 8453;

const VoteButton: React.FC<VoteButtonProps> = ({
  proposalId,
  choice,
  approvingPodId,
  onVoteSuccess,
  hasVoted: hasVotedProp,
  voteCounts,
  isAdvocateGated,
  userCanVote,
}) => {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const publicClient = usePublicClient();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSponsoredProcessing, setIsSponsoredProcessing] = useState(false);
  const [hasVotedState, setHasVotedState] = useState(false);
  const [userVoteChoice, setUserVoteChoice] = useState<number | null>(null);
  const GOVERNOR_ADDRESS = process.env
    .NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;

  // Permission check:
  // - If userCanVote is explicitly passed (from useEnhancedProposals), use it directly.
  //   This covers both Advocate-gated (DAO_CONSTITUTIONAL) and pod-scoped (POD_TREASURY_BINDING).
  // - Otherwise fall back to useGovernancePermission (legacy path).
  const { canParticipate: legacyPermission } = useGovernancePermission(
    // Skip pod check when advocate-gated or when parent already resolved it
    (isAdvocateGated || userCanVote !== undefined) ? null : approvingPodId,
    'dao-wide',
  );
  const hasGovernancePermission = userCanVote !== undefined ? userCanVote : legacyPermission;

  // Use prop if provided, otherwise check via RPC
  const hasVoted = hasVotedProp !== undefined ? hasVotedProp : hasVotedState;

  // Check if user has already voted on this proposal
  // OPTIMIZATION: Query database instead of blockchain to avoid RPC cache issues
  useEffect(() => {
    // Skip if hasVoted was passed as prop
    if (hasVotedProp !== undefined) return;

    const checkIfVoted = async () => {
      if (!address || !proposalId) return;

      try {
        // Query database for user's vote on this proposal
        const { supabase } = await import('@/utils/supabaseClient');
        const { data } = await supabase
          .from('governance_user_votes')
          .select('id, choice')
          .eq('proposal_id', proposalId)
          .eq('voter_address', address.toLowerCase())
          .maybeSingle();

        setHasVotedState(!!data);
        // Store the vote choice (Governor format: 0=Against, 1=For, 2=Abstain)
        // Convert to UI format (1=For, 2=Against, 3=Abstain)
        if (data?.choice !== undefined) {
          const uiChoice = data.choice === 1 ? 1 : data.choice === 0 ? 2 : 3;
          setUserVoteChoice(uiChoice);
        }
      } catch (error) {
        console.error('Error checking if user has voted:', error);
      }
    };

    checkIfVoted();
  }, [address, proposalId, hasVotedProp, voteCounts]);

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
        `Attempting CDP vote on proposal ${proposalId} with UI choice ${choice} (Governor choice ${choice === 1 ? 1 : choice === 2 ? 0 : 2}), paymaster: ${usePaymaster}`,
      );

      const smartAccount = currentUser.evmSmartAccounts[0];

      // Map UI choice to OpenZeppelin Governor values
      // UI: 1=For, 2=Against, 3=Abstain
      // Governor: 0=Against, 1=For, 2=Abstain
      const governorChoice = choice === 1 ? 1 : choice === 2 ? 0 : 2;

      // Encode the vote call
      const callData = encodeFunctionData({
        abi: DAOGovernorABI,
        functionName: 'castVote',
        args: [BigInt(proposalId), governorChoice],
      });

      console.log('Sending user operation:', {
        smartAccount,
        functionName: 'castVote',
        args: [proposalId, governorChoice],
        uiChoice: choice,
        governorChoice,
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
        description: 'Your vote was cast on-chain!',
        variant: 'success',
      });

      // Sync vote to database immediately for instant UI updates
      try {
        console.log('🔄 Syncing vote to database...');
        const syncResponse = await fetch('/api/governance/sync-vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalId: proposalId,
            voter: smartAccount,
            choice: governorChoice,
            votingPower: 1, // Default voting power
            txHash: result.userOperationHash,
          }),
        });

        if (syncResponse.ok) {
          console.log('✅ Vote synced to database');
        } else {
          console.warn('⚠️ Failed to sync vote to database:', await syncResponse.text());
        }
      } catch (syncError) {
        console.error('❌ Error syncing vote to database:', syncError);
        // Continue anyway - vote is on-chain, sync will happen eventually
      }

      // Wait for blockchain confirmation, then refetch to update vote counts and hasVoted state
      setTimeout(() => {
        if (onVoteSuccess) {
          onVoteSuccess();
        }
      }, 2000); // Reduced to 2s since we're syncing immediately
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

  // ✅ If user has already voted, show dynamic message with their vote choice
  if (hasVoted) {
    if (choice === 1) {
      // Show message only for the first button - now with dynamic vote display
      const voteLabel = userVoteChoice
        ? choiceLabels[userVoteChoice - 1]
        : 'on this proposal';

      return (
        <div className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-center gap-2">
            <span className="text-gray-700 font-medium">
              ✓ Voted {voteLabel}
            </span>
          </div>
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

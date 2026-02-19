'use client';

import type React from 'react';
import { useState } from 'react';
import { useEvmAddress, useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { GovernanceService } from '../services/governanceService';
import { POD_LEADER_HATS } from '../../pods/utils/podLeaderHats';
import type { EnhancedProposal } from '../hooks/useEnhancedProposals';
import { useGovernancePermission } from '@/hooks/useGovernancePermission';
import { supabase } from '@/utils/supabaseClient';
import { createSupabaseSession } from '@/utils/createSupabaseSession';
import { encodeFunctionData } from 'viem';

interface EnhancedVoteButtonProps {
  proposal: EnhancedProposal;
  choice: number; // 1 = Against, 2 = For, 3 = Abstain
  onVoteSuccess?: () => void;
}

// PodGovernanceV3 ABI (simplified, no signatures)
const POD_GOVERNANCE_V3_ABI = [
  {
    name: 'recordVote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'podId', type: 'bytes32' },
      { name: 'support', type: 'uint8' },
    ],
    outputs: [],
  },
] as const;

export const EnhancedVoteButton: React.FC<EnhancedVoteButtonProps> = ({
  proposal,
  choice,
  onVoteSuccess,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [isVoting, setIsVoting] = useState(false);

  // CDP hook for gasless transactions
  const { sendUserOperation, status, error: txError } = useSendUserOperation();

  // ✅ ARCHITECTURE FIX: Check governance permission for the CORRECT pod
  // Use the proposal's approving_pod_id to determine which pod to check
  const { canParticipate: hasGovernancePermission } = useGovernancePermission(
    proposal.approving_pod_id,
    proposal.governance_context,
  );

  const getChoiceText = (choiceNum: number) => {
    const choiceMap = {
      1: 'For',
      2: 'Against',
      3: 'Abstain',
    };
    return choiceMap[choiceNum as keyof typeof choiceMap] || 'Unknown';
  };

  const getChoiceIcon = (choiceNum: number) => {
    switch (choiceNum) {
      case 1:
        return <CheckCircle className="h-4 w-4" />; // For
      case 2:
        return <XCircle className="h-4 w-4" />; // Against
      case 3:
        return <Clock className="h-4 w-4" />; // Abstain
      default:
        return null;
    }
  };

  const getChoiceColor = (choiceNum: number) => {
    switch (choiceNum) {
      case 1:
        return { bg: '#3F7A5A', hover: '#2F5D50' }; // For - SUCCESS
      case 2:
        return { bg: '#8B3A3A', hover: '#5C1F1F' }; // Against - DESTRUCTIVE
      case 3:
        return { bg: '#6b7280', hover: '#4b5563' }; // Abstain - Gray
      default:
        return { bg: '#2F5D50', hover: '#1F453A' }; // PRIMARY
    }
  };

  // ✅ FIX: Block voting if no permission
  if (!hasGovernancePermission) {
    // Only show message once (for the first choice), hide other buttons
    if (choice === 1) {
      return (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
          <Shield className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">
            You do not have governance participation permission in this pod
          </span>
        </div>
      );
    }
    // Hide other vote buttons (Against, Abstain)
    return null;
  }

  const handleVote = async () => {
    console.log('🟢 [VOTE CLICKED] handleVote function called');

    if (!address) {
      toast({
        title: 'Wallet Required',
        description: 'Please connect your wallet to vote',
        variant: 'destructive',
      });
      return;
    }

    if (!proposal.user_can_vote) {
      toast({
        title: 'Cannot Vote',
        description: "You don't have permission to vote on this proposal",
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsVoting(true);

      // CRITICAL: Ensure Supabase session exists before voting
      console.log('🔐 [VOTE DEBUG] Starting vote submission for proposal:', proposal.id);
      console.log('🔐 [VOTE DEBUG] Wallet address:', address);
      console.log('🔐 [VOTE DEBUG] Choice:', choice, '→', getChoiceText(choice).toLowerCase());

      const { data: sessionData } = await supabase.auth.getSession();
      console.error('🔐 [VOTE DEBUG] Session check result:', {
        hasSession: !!sessionData?.session,
        sessionUser: sessionData?.session?.user?.id,
      });

      if (!sessionData?.session) {
        console.error('⚠️ [VOTE DEBUG] No Supabase session found. Creating one...');

        // Authenticate with Supabase using wallet address
        const authResponse = await fetch('/api/auth/onchainkit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address,
            isEmbedded: true,
          }),
        });

        console.log('🔐 [VOTE DEBUG] Auth API response status:', authResponse.status);

        if (!authResponse.ok) {
          const errorText = await authResponse.text();
          console.error('❌ [VOTE DEBUG] Auth API failed:', errorText);
          throw new Error('Failed to authenticate with Supabase');
        }

        const { supabaseToken, supabaseRefreshToken } = await authResponse.json();

        if (!supabaseToken || !supabaseRefreshToken) {
          console.error('❌ [VOTE DEBUG] No tokens received from auth API');
          throw new Error('No authentication tokens received');
        }

        console.log('✅ [VOTE DEBUG] Received auth tokens, creating session...');

        // Set Supabase session
        await createSupabaseSession(supabaseToken, supabaseRefreshToken);

        // Verify session was created
        const { data: newSessionData } = await supabase.auth.getSession();
        console.log('✅ [VOTE DEBUG] Session created:', {
          hasSession: !!newSessionData?.session,
          userId: newSessionData?.session?.user?.id,
        });

        // Log JWT claims for debugging
        if (newSessionData?.session) {
          console.error('🔐 [VOTE DEBUG] JWT claims:', {
            sub: newSessionData.session.user.id,
            wallet_address: (newSessionData.session.user as any).wallet_address,
            userMetadata: newSessionData.session.user.user_metadata,
            appMetadata: newSessionData.session.user.app_metadata,
          });
        }
      } else {
        console.error('✅ [VOTE DEBUG] Supabase session already exists');

        // Log JWT claims for debugging
        console.error('🔐 [VOTE DEBUG] Existing JWT claims:', {
          sub: sessionData.session.user.id,
          wallet_address: (sessionData.session.user as any).wallet_address,
          userMetadata: sessionData.session.user.user_metadata,
          appMetadata: sessionData.session.user.app_metadata,
        });
      }

      const voteValue = getChoiceText(choice).toLowerCase() as
        | 'against'
        | 'for'
        | 'abstain';

      if (proposal.type === 'pod_creation' || proposal.type === 'pod_level') {
        // ✅ V3: Simplified gasless on-chain voting (CDP AA Wallet)
        console.log('🔐 [VOTE V3] Starting gasless on-chain vote (CDP)...', {
          proposalType: proposal.type,
          proposalId: proposal.id,
          vote: voteValue,
          podId: proposal.approving_pod_id,
        });

        // Helper function to convert UUID to bytes32
        const uuidToBytes32 = (uuid: string): `0x${string}` => {
          const hex = uuid.replace(/-/g, '');
          return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
        };

        // Convert vote to uint8
        const voteToUint8 = (vote: string): number => {
          switch (vote.toLowerCase()) {
            case 'against': return 0;
            case 'for': return 1;
            case 'abstain': return 2;
            default: throw new Error(`Invalid vote: ${vote}`);
          }
        };

        const contractAddress = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;

        if (!contractAddress) {
          toast({
            title: 'Configuration Error',
            description: 'PodGovernance contract address not configured',
            variant: 'destructive',
          });
          return;
        }

        // 1. Save to database first (for real-time tallies)
        console.log('💾 [VOTE V3] Step 1: Saving to database...');
        const voteData = {
          proposal_id: proposal.id,
          voter_address: address.toLowerCase(),
          vote: voteValue,
          timestamp: new Date().toISOString(),
          hat_id: proposal.required_hat || POD_LEADER_HATS.EXECUTIVE_POD_LEADER,
          // ✅ ARCHITECTURE NOTE: No user signature required for CDP gasless transactions
          // Smart contract wallet signatures are handled internally by CDP SDK
          // The transaction is authenticated via the user's embedded wallet control
          signature: '',
          pod_id: proposal.approving_pod_id,
        };
        await GovernanceService.submitVote(voteData);
        console.log('✅ [VOTE V3] Vote saved to database');

        // Show success immediately after database save
        toast({
          title: 'Vote Recorded ✓',
          description: `Your ${voteValue} vote has been saved successfully`,
        });

        // CRITICAL: Trigger refetch to update UI immediately
        console.log('🔄 [VOTE V3] Triggering UI refetch...');
        onVoteSuccess?.();

        // NOTE: On-chain recording temporarily disabled due to CDP Smart Account issues
        // Votes are saved to database and tallied correctly
        // On-chain recording will be re-enabled once CDP issue is resolved
        console.log('ℹ️ [VOTE V3] On-chain recording disabled - vote saved to database only');
      } else {
        // Handle governance votes - this would integrate with existing VoteButton logic
        toast({
          title: 'Feature Coming Soon',
          description: 'On-chain governance voting integration coming soon',
        });
        return;
      }
    } catch (error) {
      console.error('Failed to submit vote to database:', error);
      toast({
        title: 'Vote Failed',
        description:
          error instanceof Error ? error.message : 'Failed to save vote to database',
        variant: 'destructive',
      });
    } finally {
      setIsVoting(false);
    }
  };

  // Check if user has already voted
  const hasVoted = !!proposal.user_vote;
  const userVotedChoice = hasVoted ? proposal.user_vote?.vote : null;
  const isCurrentChoice =
    userVotedChoice === getChoiceText(choice).toLowerCase();

  // Don't show button if user has already voted and this isn't their choice
  if (hasVoted && !isCurrentChoice) {
    return null;
  }

  // Show voted state if this is the user's choice (unified style with VoteButton)
  if (hasVoted && isCurrentChoice) {
    return (
      <div className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-center gap-2">
          <span className="text-gray-700 font-medium">
            ✓ Voted {getChoiceText(choice)}
          </span>
        </div>
      </div>
    );
  }

  // Show access denied state if user can't vote (fallback check)
  if (!proposal.user_can_vote) {
    // Only show message once (for the first choice), hide other buttons
    if (choice === 1) {
      return (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
          <Shield className="h-4 w-4 text-gray-500" />
          <span className="text-sm text-gray-600">
            You do not have governance participation permission in this pod
          </span>
        </div>
      );
    }
    // Hide other vote buttons
    return null;
  }

  // Show voting button
  const colors = getChoiceColor(choice);
  return (
    <Button
      onClick={handleVote}
      disabled={isVoting}
      className="flex items-center gap-1"
      size="sm"
      style={{ backgroundColor: colors.bg }}
      onMouseEnter={(e) => {
        if (!isVoting) e.currentTarget.style.backgroundColor = colors.hover;
      }}
      onMouseLeave={(e) => {
        if (!isVoting) e.currentTarget.style.backgroundColor = colors.bg;
      }}
    >
      {isVoting ? (
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        getChoiceIcon(choice)
      )}
      {isVoting ? 'Voting...' : getChoiceText(choice)}
    </Button>
  );
};

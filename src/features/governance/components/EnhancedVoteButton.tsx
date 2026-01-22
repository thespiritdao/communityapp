'use client';

import type React from 'react';
import { useState } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
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

interface EnhancedVoteButtonProps {
  proposal: EnhancedProposal;
  choice: number; // 1 = Against, 2 = For, 3 = Abstain
  onVoteSuccess?: () => void;
}

export const EnhancedVoteButton: React.FC<EnhancedVoteButtonProps> = ({
  proposal,
  choice,
  onVoteSuccess,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { toast } = useToast();
  const [isVoting, setIsVoting] = useState(false);

  // DEBUG: Verify component is loaded with updated code
  console.log('🔵 [COMPONENT LOADED] EnhancedVoteButton mounted with debugging enabled');

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
        // ✅ Handle off-chain votes (pod creation and pod-level proposals)
        // Generate a cryptographic signature for the vote
        const voteMessage = {
          proposal_id: proposal.id,
          voter: address,
          vote: voteValue,
          timestamp: new Date().toISOString(),
          hat_id: proposal.required_hat || POD_LEADER_HATS.EXECUTIVE_POD_LEADER,
        };

        // Create a simple hash-like signature (in production, use actual signing with wallet)
        const messageString = JSON.stringify(voteMessage);
        const encoder = new TextEncoder();
        const data = encoder.encode(messageString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const signature = `0x${hashHex}`;

        console.log('🔐 [VOTE] Generated signature:', {
          proposalType: proposal.type,
          message: messageString,
          signature: signature,
        });

        // Prepare vote data
        const voteData = {
          proposal_id: proposal.id,
          voter_address: address.toLowerCase(),
          vote: voteValue,
          timestamp: voteMessage.timestamp,
          hat_id: voteMessage.hat_id,
          signature: signature,
        };

        console.log('📊 [VOTE] Submitting vote:', {
          type: proposal.type,
          proposalId: proposal.id,
          vote: voteValue,
        });

        // Submit vote to database
        await GovernanceService.submitVote(voteData);

        const proposalTypeLabel = proposal.type === 'pod_creation' ? 'pod creation' : 'pod-level';
        toast({
          title: 'Vote Submitted',
          description: `Your ${voteValue} vote has been recorded for ${proposalTypeLabel} proposal`,
        });

        // Trigger immediate refetch to update button states
        onVoteSuccess?.();
      } else {
        // Handle governance votes - this would integrate with existing VoteButton logic
        toast({
          title: 'Feature Coming Soon',
          description: 'On-chain governance voting integration coming soon',
        });
        return;
      }
    } catch (error) {
      console.error('Failed to submit vote:', error);
      toast({
        title: 'Vote Failed',
        description:
          error instanceof Error ? error.message : 'Failed to submit vote',
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

  // Show voted state if this is the user's choice
  if (hasVoted && isCurrentChoice) {
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        {getChoiceIcon(choice)}
        Voted {getChoiceText(choice)}
      </Badge>
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

'use client';

import type React from 'react';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, XCircle, Clock, Shield } from 'lucide-react';
import { GovernanceService } from '../services/governanceService';
import { POD_LEADER_HATS } from '../../pods/utils/podLeaderHats';
import type { EnhancedProposal } from '../hooks/useEnhancedProposals';
import { useGovernancePermission } from '@/hooks/useGovernancePermission';

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
  const { address } = useAccount();
  const { toast } = useToast();
  const [isVoting, setIsVoting] = useState(false);

  // ✅ ARCHITECTURE FIX: Check governance permission for the CORRECT pod
  // Use the proposal's approving_pod_id to determine which pod to check
  const { canParticipate: hasGovernancePermission } = useGovernancePermission(
    proposal.approving_pod_id,
    proposal.governance_context,
  );

  const getChoiceText = (choiceNum: number) => {
    const choiceMap = {
      1: 'Against',
      2: 'For',
      3: 'Abstain',
    };
    return choiceMap[choiceNum as keyof typeof choiceMap] || 'Unknown';
  };

  const getChoiceIcon = (choiceNum: number) => {
    switch (choiceNum) {
      case 1:
        return <XCircle className="h-4 w-4" />;
      case 2:
        return <CheckCircle className="h-4 w-4" />;
      case 3:
        return <Clock className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getChoiceColor = (choiceNum: number) => {
    switch (choiceNum) {
      case 1:
        return { bg: '#8B3A3A', hover: '#5C1F1F' }; // Against - DESTRUCTIVE
      case 2:
        return { bg: '#3F7A5A', hover: '#2F5D50' }; // For - SUCCESS
      case 3:
        return { bg: '#6b7280', hover: '#4b5563' }; // Abstain - Gray
      default:
        return { bg: '#2F5D50', hover: '#1F453A' }; // PRIMARY
    }
  };

  // ✅ FIX: Block voting if no permission
  if (!hasGovernancePermission) {
    return (
      <Button
        disabled
        variant="outline"
        size="sm"
        title="You do not have governance participation permission in the required pod"
      >
        {getChoiceText(choice)} (No Permission)
      </Button>
    );
  }

  const handleVote = async () => {
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

      const voteValue = getChoiceText(choice).toLowerCase() as
        | 'against'
        | 'for'
        | 'abstain';

      if (proposal.type === 'pod_creation') {
        // Generate a cryptographic signature for the vote
        // This creates a deterministic signature based on proposal, voter, vote, and timestamp
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

        console.log('🔐 Generated signature:', {
          message: messageString,
          signature: signature,
          signatureLength: signature.length,
        });

        // Handle pod creation votes with signature
        await GovernanceService.submitVote({
          proposal_id: proposal.id,
          voter_address: address,
          vote: voteValue,
          timestamp: voteMessage.timestamp,
          hat_id: voteMessage.hat_id,
          signature: signature,
        });

        toast({
          title: 'Vote Submitted',
          description: `Your ${voteValue} vote has been recorded and signed for pod creation proposal`,
        });
      } else {
        // Handle governance votes - this would integrate with existing VoteButton logic
        toast({
          title: 'Feature Coming Soon',
          description: 'On-chain governance voting integration coming soon',
        });
        return;
      }

      onVoteSuccess?.();
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

  // Show access denied state if user can't vote
  if (!proposal.user_can_vote) {
    return (
      <Button disabled={true} variant="outline" className="opacity-50">
        <Shield className="h-4 w-4 mr-1" />
        {getChoiceText(choice)} (No Permission)
      </Button>
    );
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

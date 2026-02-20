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

  // Check governance permission for the CORRECT pod
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

  // Block voting if no permission
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
    console.log('[VOTE CLICKED] handleVote function called');

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
      console.log('[VOTE DEBUG] Starting vote submission for proposal:', proposal.id);
      console.log('[VOTE DEBUG] Wallet address:', address);
      console.log('[VOTE DEBUG] Choice:', choice, '->', getChoiceText(choice).toLowerCase());

      const { data: sessionData } = await supabase.auth.getSession();
      console.log('[VOTE DEBUG] Session check result:', {
        hasSession: !!sessionData?.session,
        sessionUser: sessionData?.session?.user?.id,
      });

      if (!sessionData?.session) {
        console.log('[VOTE DEBUG] No Supabase session found. Creating one...');

        // Authenticate with Supabase using wallet address
        const authResponse = await fetch('/api/auth/onchainkit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: address,
            isEmbedded: true,
          }),
        });

        console.log('[VOTE DEBUG] Auth API response status:', authResponse.status);

        if (!authResponse.ok) {
          const errorText = await authResponse.text();
          console.error('[VOTE DEBUG] Auth API failed:', errorText);
          throw new Error('Failed to authenticate with Supabase');
        }

        const { supabaseToken, supabaseRefreshToken } = await authResponse.json();

        if (!supabaseToken || !supabaseRefreshToken) {
          console.error('[VOTE DEBUG] No tokens received from auth API');
          throw new Error('No authentication tokens received');
        }

        console.log('[VOTE DEBUG] Received auth tokens, creating session...');

        // Set Supabase session
        await createSupabaseSession(supabaseToken, supabaseRefreshToken);

        // Verify session was created
        const { data: newSessionData } = await supabase.auth.getSession();
        console.log('[VOTE DEBUG] Session created:', {
          hasSession: !!newSessionData?.session,
          userId: newSessionData?.session?.user?.id,
        });

        // Log JWT claims for debugging
        if (newSessionData?.session) {
          console.log('[VOTE DEBUG] JWT claims:', {
            sub: newSessionData.session.user.id,
            userMetadata: newSessionData.session.user.user_metadata,
          });
        }
      } else {
        console.log('[VOTE DEBUG] Supabase session already exists');

        // Log JWT claims for debugging
        console.log('[VOTE DEBUG] Existing JWT claims:', {
          sub: sessionData.session.user.id,
          userMetadata: sessionData.session.user.user_metadata,
        });
      }

      const voteValue = getChoiceText(choice).toLowerCase() as
        | 'against'
        | 'for'
        | 'abstain';

      console.log('[VOTE DEBUG] Proposal type check:', {
        proposalId: proposal.id,
        proposalType: proposal.type,
        userCanVote: proposal.user_can_vote,
        governanceTier: proposal.governance_tier,
        approvingPodId: proposal.approving_pod_id,
      });

      if (proposal.type === 'pod_creation' || proposal.type === 'pod_level') {
        // CRITICAL: Check tier FIRST — POD_OPERATIONAL never needs contract address
        const isOperational = proposal.governance_tier === 'POD_OPERATIONAL' || !proposal.governance_tier;

        console.log('[VOTE V3] Vote path:', {
          proposalType: proposal.type,
          governance_tier: proposal.governance_tier ?? 'POD_OPERATIONAL (default)',
          isOperational,
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

        // Step 1: Always save to database first (for all tiers)
        console.log('[VOTE V3] Step 1: Saving to database...');
        const voteData = {
          proposal_id: proposal.id,
          voter_address: address.toLowerCase(),
          vote: voteValue,
          timestamp: new Date().toISOString(),
          hat_id: proposal.required_hat || POD_LEADER_HATS.EXECUTIVE_POD_LEADER,
          signature: '',
          pod_id: proposal.approving_pod_id,
        };
        await GovernanceService.submitVote(voteData);
        console.log('[VOTE V3] Vote saved to database');

        // Step 2: POD_OPERATIONAL = DB only, done
        if (isOperational) {
          console.log('[VOTE V3] POD_OPERATIONAL - vote complete (DB only)');
          toast({
            title: 'Vote Recorded',
            description: `Your ${voteValue} vote has been saved.`,
          });
        } else {
          // POD_TREASURY_BINDING: also record on-chain via PodGovernanceV3
          const contractAddress = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;

          if (!contractAddress) {
            console.warn('[VOTE V3] NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS not set - vote saved to DB only');
            toast({
              title: 'Vote Saved',
              description: `Your ${voteValue} vote was saved. On-chain recording requires contract configuration.`,
            });
          } else {
            console.log('[VOTE V3] Step 2: Encoding contract call for POD_TREASURY_BINDING...');
            const callData = encodeFunctionData({
              abi: POD_GOVERNANCE_V3_ABI,
              functionName: 'recordVote',
              args: [
                uuidToBytes32(proposal.id),
                uuidToBytes32(proposal.approving_pod_id || proposal.id),
                voteToUint8(voteValue),
              ],
            });
            console.log('[VOTE V3] Call data encoded');

            console.log('[VOTE V3] Step 3: Submitting to blockchain (gasless via CDP)...');

            if (!currentUser?.evmSmartAccounts?.[0]) {
              console.warn('[VOTE V3] No smart account found - vote saved to DB only');
              toast({
                title: 'Vote Saved (Database Only)',
                description: `Your ${voteValue} vote was saved. On-chain recording requires smart account initialization.`,
              });
            } else {
              const smartAccount = currentUser.evmSmartAccounts[0];
              console.log('[VOTE V3] Using smart account:', smartAccount);

              try {
                const result = await sendUserOperation({
                  evmSmartAccount: smartAccount,
                  network: 'base',
                  calls: [{
                    to: contractAddress,
                    data: callData,
                    value: 0n,
                  }],
                  useCdpPaymaster: true,
                });

                console.log('[VOTE V3] Vote recorded on-chain!', { result, status });

                toast({
                  title: 'Vote Recorded On-Chain',
                  description: `Your ${voteValue} vote has been permanently recorded on Base blockchain`,
                });
              } catch (onchainError) {
                console.error('[VOTE V3] On-chain submission failed (vote still saved to DB):', onchainError);
                toast({
                  title: 'Vote Saved (DB Only)',
                  description: `Your ${voteValue} vote was saved to database. On-chain recording will be retried later.`,
                });
              }
            }
          }
        }

        // Always trigger refetch to update UI
        console.log('[VOTE V3] Triggering UI refetch...');
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
      <div className="w-full px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-center gap-2">
          <span className="text-gray-700 font-medium">
            Voted {getChoiceText(choice)}
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

'use client';

import type React from 'react';
import { useState } from 'react';
import { useCurrentUser } from '@coinbase/cdp-hooks';
import { useUserWallet, useSigningWallet } from '@/hooks/useUserWallet';
import { useSendUserOperationWithAttribution as useSendUserOperation } from '@/hooks/useSendUserOperationWithAttribution';
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
import { requestSupabaseSession } from '@/features/identity/lib/cdpSession';
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
  // Identity wallet (canonical) — gate + DB vote attribution (voter_address),
  // so the vote and the "already voted" check resolve to the user across devices.
  const address = useUserWallet();
  // Device signing wallet — only for the /api/auth/onchainkit session bootstrap.
  const { address: signingAddress } = useSigningWallet();
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
        <div className="flex items-start gap-2 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
          <Shield className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
          <span className="text-sm text-gray-600">
            Voting here requires a governance-participating role in this pod. If
            this pod gates a role on holding a community token, you'll qualify
            once you meet that requirement and are approved into the role.
          </span>
        </div>
      );
    }
    // Hide other vote buttons (Against, Abstain)
    return null;
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

      // Ensure Supabase session exists before voting
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData?.session) {
        // Authenticate with Supabase using wallet address
        const authResponse = await requestSupabaseSession({
          address: (signingAddress ?? address) as string,
        });

        if (!authResponse.ok) {
          const errorText = await authResponse.text();
          console.error('Auth API failed:', errorText);
          throw new Error('Failed to authenticate with Supabase');
        }

        const { supabaseToken, supabaseRefreshToken } = await authResponse.json();

        if (!supabaseToken || !supabaseRefreshToken) {
          throw new Error('No authentication tokens received');
        }

        // Set Supabase session
        await createSupabaseSession(supabaseToken, supabaseRefreshToken);
      }

      const voteValue = getChoiceText(choice).toLowerCase() as
        | 'against'
        | 'for'
        | 'abstain';

      if (proposal.type === 'pod_creation' || proposal.type === 'pod_level') {
        // Check tier FIRST — POD_OPERATIONAL never needs contract address
        const isOperational = proposal.governance_tier === 'POD_OPERATIONAL' || !proposal.governance_tier;

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

        // Step 1: Save to database (all tiers)
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

        // Step 2: POD_OPERATIONAL = DB only, done
        if (isOperational) {
          toast({
            title: 'Vote Recorded',
            description: `Your ${voteValue} vote has been saved.`,
          });
        } else {
          // POD_TREASURY_BINDING: also record on-chain via PodGovernanceV3
          const contractAddress = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;

          if (!contractAddress) {
            toast({
              title: 'Vote Saved',
              description: `Your ${voteValue} vote was saved. On-chain recording requires contract configuration.`,
            });
          } else {
            const callData = encodeFunctionData({
              abi: POD_GOVERNANCE_V3_ABI,
              functionName: 'recordVote',
              args: [
                uuidToBytes32(proposal.id),
                uuidToBytes32(proposal.approving_pod_id || proposal.id),
                voteToUint8(voteValue),
              ],
            });
            if (!currentUser?.evmSmartAccounts?.[0]) {
              toast({
                title: 'Vote Saved (Database Only)',
                description: `Your ${voteValue} vote was saved. On-chain recording requires smart account initialization.`,
              });
            } else {
              const smartAccount = currentUser.evmSmartAccounts[0];

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

                toast({
                  title: 'Vote Recorded On-Chain',
                  description: `Your ${voteValue} vote has been permanently recorded on Base blockchain`,
                });
              } catch (onchainError) {
                console.error('On-chain vote submission failed (vote still saved to DB):', onchainError);
                toast({
                  title: 'Vote Saved (DB Only)',
                  description: `Your ${voteValue} vote was saved to database. On-chain recording will be retried later.`,
                });
              }
            }
          }
        }

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
        <div className="flex items-start gap-2 px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
          <Shield className="h-4 w-4 text-gray-500 mt-0.5 shrink-0" />
          <span className="text-sm text-gray-600">
            Voting here requires a governance-participating role in this pod. If
            this pod gates a role on holding a community token, you'll qualify
            once you meet that requirement and are approved into the role.
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

//src/features/governance/components/ProposalVoteForm.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useContractRead } from 'wagmi';
import { formatEther } from 'viem';
import { Transaction, TransactionButton, TransactionSponsor, TransactionStatus, TransactionStatusLabel, TransactionStatusAction } from '@coinbase/onchainkit/transaction';
import AdvocateMembershipABI from 'src/abis/AdvocateMembershipABI.json';
import DAOGovernorABI from 'src/abis/DAO_GovernorABI.json';
// import MembershipNFTABI from '@/abis/MembershipNFTABI.json';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { governanceNotificationService } from 'src/utils/governanceNotificationService';
import VotingCountdown from './VotingCountdown';
import { useGovernanceNotifications } from '@/context/GovernanceNotificationContext';

interface ProposalVoteFormProps {
  proposalId: string;
  proposalTitle?: string;
  proposalState?: number;
  hasVoted?: boolean;
  onSuccess?: () => void;
}

// Contract addresses from environment variables
const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
// Remove MEMBERSHIP_NFT_ADDRESS and use NEXT_PUBLIC_ADVOCATE as default
const ADVOCATE_ADDRESS = process.env.NEXT_PUBLIC_ADVOCATE as `0x${string}`;

// Vote types
const VoteType = {
  Against: 0,
  For: 1,
  Abstain: 2
};

export const ProposalVoteForm: React.FC<ProposalVoteFormProps> = ({ proposalId, proposalTitle, proposalState: propProposalState, hasVoted: hasVotedProp, onSuccess }) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const { refreshNotifications } = useGovernanceNotifications();
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(!!hasVotedProp);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setHasVoted(!!hasVotedProp);
  }, [hasVotedProp]);

  // Get proposal details
  const { data: proposal } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposals',
    args: [proposalId],
    enabled: !!proposalId,
  });

  // Use propProposalState if provided, else use contract read
  const { data: proposalStateRaw } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'state',
    args: [proposalId],
    enabled: !!proposalId && propProposalState === undefined,
  });
  const proposalState = propProposalState !== undefined ? propProposalState : proposalStateRaw;

  // Get proposal metadata if available (move this up before any use)
  const { data: metadata } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposalMetadata',
    args: [proposalId],
    enabled: !!proposalId,
  });

  // Determine required token for voting from proposal metadata (onchain or Supabase)
  const [votingTokenAddress, setVotingTokenAddress] = useState<string | undefined>(ADVOCATE_ADDRESS);
  const [votingTokenABI, setVotingTokenABI] = useState<any>(AdvocateMembershipABI);

  useEffect(() => {
    // If metadata specifies a token, use it
    if (metadata && (metadata as any).token_id && (metadata as any).contract_address) {
      setVotingTokenAddress((metadata as any).contract_address);
      // TODO: Dynamically select ABI based on token type if needed
      setVotingTokenABI(AdvocateMembershipABI); // Default to AdvocateMembershipABI for now
    } else {
      setVotingTokenAddress(ADVOCATE_ADDRESS);
      setVotingTokenABI(AdvocateMembershipABI);
    }
  }, [metadata]);

  // Get voting power
  const { data: votingPower } = useContractRead({
    address: votingTokenAddress as `0x${string}`,
    abi: votingTokenABI,
    functionName: 'getVotes',
    args: [address as `0x${string}`],
    enabled: !!address && !!votingTokenAddress,
  });

  // Define canVote: proposal must be active, user must have voting power, and not have already voted
  const canVote = proposalState === 1 && votingPower && Number(votingPower) > 0 && !hasVoted;

  // Only use OnChainKit's <Transaction> for voting
  const voteCall = [
    {
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'castVote',
      args: [proposalId, selectedVote === null ? 0 : selectedVote],
    },
  ];

  if (!address) {
    return <div className="vote-form p-4">Please connect your wallet to vote on proposals.</div>;
  }

  const getProposalStateText = (state: number | undefined) => {
    if (state === undefined) return 'Unknown';
    const states = [
      'Pending',
      'Active',
      'Canceled',
      'Defeated',
      'Succeeded',
      'Queued',
      'Expired',
      'Executed'
    ];
    return states[state] || 'Unknown';
  };

  // Status badge color logic (match /vote/page.tsx)
  const getStatusBadgeClass = (state: number | undefined) => {
    switch (state) {
      case 1: return 'bg-blue-100 text-blue-800'; // Active
      case 4: return 'bg-green-100 text-green-800'; // Passed
      case 3: return 'bg-red-100 text-red-800'; // Failed
      case 7: return 'bg-purple-100 text-purple-800'; // Executed
      case 2: return 'bg-gray-100 text-gray-800'; // Canceled
      case 6: return 'bg-yellow-100 text-yellow-800'; // Expired
      case 5: return 'bg-orange-100 text-orange-800'; // Queued
      case 0: return 'bg-gray-100 text-gray-800'; // Pending
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card className="vote-form">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Cast Your Vote</span>
          <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusBadgeClass(Number(proposalState))}`}>
            {getProposalStateText(Number(proposalState))}
          </span>
        </CardTitle>
        <CardDescription>
          {proposalTitle || (metadata && (metadata as any).title) || 'Untitled'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasVoted ? (
          <div className="text-center p-4">
            <button
              className="w-full py-2 px-4 bg-green-600 text-white rounded-lg font-semibold cursor-not-allowed opacity-60"
              disabled
              style={{ pointerEvents: 'none' }}
            >
              ✓ Voted
            </button>
            <p className="text-sm text-gray-500 mt-2">Thank you for participating in governance</p>
          </div>
        ) : (
          <>
            {proposalState !== 1 ? (
              <p className="text-center p-4 text-amber-600">
                This proposal is not currently active for voting
              </p>
            ) : (
              <>
                <div className="voting-power mb-4">
                  <p>Your voting power: <strong>{votingPower ? votingPower.toString() : '0'}</strong></p>
                </div>
                {metadata?.voting_end && (
                  <VotingCountdown votingEnd={metadata.voting_end} />
                )}
                <div className="vote-options grid grid-cols-3 gap-3 mb-6">
                  <button
                    type="button"
                    className={`vote-option for${selectedVote === VoteType.For ? ' selected' : ''}`}
                    onClick={() => setSelectedVote(VoteType.For)}
                  >
                    For
                  </button>
                  <button
                    type="button"
                    className={`vote-option against${selectedVote === VoteType.Against ? ' selected' : ''}`}
                    onClick={() => setSelectedVote(VoteType.Against)}
                  >
                    Against
                  </button>
                  <button
                    type="button"
                    className={`vote-option abstain${selectedVote === VoteType.Abstain ? ' selected' : ''}`}
                    onClick={() => setSelectedVote(VoteType.Abstain)}
                  >
                    Abstain
                  </button>
                </div>
                <Transaction
                  address={address?.toLowerCase() as `0x${string}`}
                  isSponsored={true}
                  chainId={Number(process.env.NEXT_PUBLIC_CHAIN_ID) || 8453}
                  calls={voteCall}
                  onSuccess={async (txResult) => {
                    toast({
                      title: 'Vote cast successfully',
                      description: 'Your vote has been recorded.',
                      variant: 'success',
                    });
                    setHasVoted(true);
                    if (address && proposalId) {
                      try {
                        await governanceNotificationService.markAllNotificationsForProposalAsReadForUser(proposalId, address);
                        await refreshNotifications();
                      } catch (error) {
                        console.error('Error marking notifications as read:', error);
                      }
                    }
                    // Add a small delay to ensure API has time to update
                    setTimeout(() => {
                      // Call onSuccess after all async operations complete
                      onSuccess?.();
                    }, 1000);
                  }}
                  onError={(error) => {
                    toast({
                      title: 'Voting failed',
                      description: error.message || 'There was an error casting your vote.',
                      variant: 'destructive',
                    });
                  }}
                >
                  <TransactionButton
                    text={isLoading ? 'Submitting Vote...' : 'Submit Vote'}
                    className="w-full"
                    disabled={!canVote || selectedVote === null || isLoading}
                  />
                  <TransactionSponsor />
                  <TransactionStatus>
                    <TransactionStatusLabel />
                    <TransactionStatusAction />
                  </TransactionStatus>
                </Transaction>
                {!canVote && votingPower && BigInt(votingPower.toString()) === 0n && (
                  <p className="text-amber-600 text-sm mt-2">
                    You need to own at least one membership NFT to vote.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
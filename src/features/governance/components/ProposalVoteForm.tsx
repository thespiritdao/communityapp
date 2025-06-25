//src/features/governance/components/ProposalVoteForm.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { useAccount, useContractRead, useContractWrite, usePrepareContractWrite } from 'wagmi';
import { formatEther } from 'viem';
import DAOGovernorABI from '@/abis/DAOGovernorABI.json';
import MembershipNFTABI from '@/abis/MembershipNFTABI.json';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ProposalVoteFormProps {
  proposalId: string;
  onSuccess?: () => void;
}

// Contract addresses from environment variables
const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const MEMBERSHIP_NFT_ADDRESS = process.env.NEXT_PUBLIC_MEMBERSHIP_NFT as `0x${string}`;

// Vote types
const VoteType = {
  Against: 0,
  For: 1,
  Abstain: 2
};

export const ProposalVoteForm: React.FC<ProposalVoteFormProps> = ({ proposalId, onSuccess }) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Get proposal details
  const { data: proposal } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposals',
    args: [proposalId],
    enabled: !!proposalId,
  });

  // Get proposal state
  const { data: proposalState } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'state',
    args: [proposalId],
    enabled: !!proposalId,
  });

  // Get voting power
  const { data: votingPower } = useContractRead({
    address: MEMBERSHIP_NFT_ADDRESS,
    abi: MembershipNFTABI,
    functionName: 'getVotes',
    args: [address as `0x${string}`],
    enabled: !!address,
  });

  // Get proposal metadata if available
  const { data: metadata } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposalMetadata',
    args: [proposalId],
    enabled: !!proposalId,
  });

  // Check if user has already voted
  const { data: hasVotedData } = useContractRead({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'hasVoted',
    args: [proposalId, address as `0x${string}`],
    enabled: !!address && !!proposalId,
  });

  // Update hasVoted state when data changes
  useEffect(() => {
    if (hasVotedData !== undefined) {
      setHasVoted(!!hasVotedData);
    }
  }, [hasVotedData]);

  // Prepare the vote transaction
  const { config: voteConfig, error: voteError } = usePrepareContractWrite({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'castVote',
    args: [proposalId, selectedVote === null ? 0 : selectedVote],
    enabled: selectedVote !== null && !hasVoted && proposalState === 1, // Active state is 1
  });

  const { write: castVote, isLoading: isVoting, isSuccess: voteSuccess } = useContractWrite(voteConfig);

  // Handle vote submission
  const handleVote = async () => {
    if (!castVote) return;
    
    try {
      setIsLoading(true);
      castVote();
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: 'Voting failed',
        description: 'There was an error casting your vote.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle successful vote
  useEffect(() => {
    if (voteSuccess) {
      toast({
        title: 'Vote cast successfully',
        description: 'Your vote has been recorded.',
      });
      onSuccess?.();
    }
  }, [voteSuccess, onSuccess, toast]);

  // Map proposal state to human-readable text
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

  // Get voting period end date (if available)
  const getVotingEndDate = () => {
    if (!proposal) return null;
    
    // This is simplified - you'd need to calculate the actual end date
    // based on the deadline in the proposal and current block data
    const deadline = proposal[3]; // Assuming this is the deadline field
    return new Date(Number(deadline) * 1000).toLocaleDateString();
  };

  // Check if user can vote
  const canVote = 
    !!address && 
    proposalState === 1 && // Active state
    !hasVoted && 
    votingPower && 
    BigInt(votingPower.toString()) > 0n;

  if (!address) {
    return <div className="vote-form p-4">Please connect your wallet to vote on proposals.</div>;
  }

  return (
    <Card className="vote-form">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Cast Your Vote</span>
          <Badge variant={proposalState === 1 ? "outline" : "secondary"}>
            {getProposalStateText(Number(proposalState))}
          </Badge>
        </CardTitle>
        <CardDescription>
          {metadata ? (
            <>Proposal: {(metadata as any).title || 'Untitled'}</>
          ) : (
            <>Proposal ID: {proposalId.substring(0, 10)}...</>
          )}
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {hasVoted ? (
          <div className="text-center p-4">
            <p className="text-green-600 mb-2">✓ You have already voted on this proposal</p>
            <p className="text-sm text-gray-500">Thank you for participating in governance</p>
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
                  {getVotingEndDate() && (
                    <p className="text-sm text-gray-500">Voting ends: {getVotingEndDate()}</p>
                  )}
                </div>
                
                <div className="vote-options grid grid-cols-3 gap-3 mb-6">
                  <Button
                    variant={selectedVote === VoteType.For ? "default" : "outline"}
                    onClick={() => setSelectedVote(VoteType.For)}
                    className={selectedVote === VoteType.For ? "bg-green-600" : ""}
                  >
                    For
                  </Button>
                  <Button
                    variant={selectedVote === VoteType.Against ? "default" : "outline"}
                    onClick={() => setSelectedVote(VoteType.Against)}
                    className={selectedVote === VoteType.Against ? "bg-red-600" : ""}
                  >
                    Against
                  </Button>
                  <Button
                    variant={selectedVote === VoteType.Abstain ? "default" : "outline"}
                    onClick={() => setSelectedVote(VoteType.Abstain)}
                    className={selectedVote === VoteType.Abstain ? "bg-gray-500" : ""}
                  >
                    Abstain
                  </Button>
                </div>
                
                <Button 
                  onClick={handleVote}
                  disabled={!canVote || selectedVote === null || isVoting || isLoading}
                  className="w-full"
                >
                  {isVoting || isLoading ? 'Submitting Vote...' : 'Submit Vote'}
                </Button>
                
                {voteError && (
                  <p className="text-red-500 text-sm mt-2">
                    Error: {voteError.message || 'Failed to prepare voting transaction'}
                  </p>
                )}
                
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

export default ProposalVoteForm;
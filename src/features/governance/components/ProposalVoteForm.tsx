//src/features/governance/components/ProposalVoteForm.tsx

'use client';

import type React from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useReadContract } from 'wagmi';
import type { Abi } from 'viem';
import { encodeFunctionData } from 'viem';
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import AdvocateMembershipABIJson from '@/abis/AdvocateMembershipABI.json';
import DAOGovernorABIJson from '@/abis/DAO_GovernorABI.json';

const AdvocateMembershipABI = AdvocateMembershipABIJson as Abi;
const DAOGovernorABI = DAOGovernorABIJson as Abi;
// import MembershipNFTABI from '../../../abis/MembershipNFTABI.json';
import { useToast } from '@/components/ui/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import VotingCountdown from './VotingCountdown';
import { useUnifiedNotifications } from '@/context/UnifiedNotificationContext';

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
  Abstain: 2,
};

export const ProposalVoteForm: React.FC<ProposalVoteFormProps> = ({
  proposalId,
  proposalTitle,
  proposalState: propProposalState,
  hasVoted: hasVotedProp,
  onSuccess,
}) => {
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();
  const { toast } = useToast();
  const { refreshNotifications } = useUnifiedNotifications();
  const [selectedVote, setSelectedVote] = useState<number | null>(null);
  const [hasVoted, setHasVoted] = useState(!!hasVotedProp);
  const [isLoading, setIsLoading] = useState(false);

  // Get address from CDP Smart Account
  const address = currentUser?.evmSmartAccounts?.[0] as `0x${string}` | undefined;

  useEffect(() => {
    setHasVoted(!!hasVotedProp);
  }, [hasVotedProp]);

  // Get proposal details
  const { data: proposal } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposals',
    args: [proposalId],
    query: {
      enabled: !!proposalId,
    },
  });

  // Use propProposalState if provided, else use contract read
  const { data: proposalStateRaw } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'state',
    args: [proposalId],
    query: {
      enabled: !!proposalId && propProposalState === undefined,
    },
  });
  const proposalState =
    propProposalState !== undefined ? propProposalState : proposalStateRaw;

  // Get proposal metadata if available (move this up before any use)
  const { data: metadata } = useReadContract({
    address: GOVERNOR_ADDRESS,
    abi: DAOGovernorABI,
    functionName: 'proposalMetadata',
    args: [proposalId],
    query: {
      enabled: !!proposalId,
    },
  });

  // Determine required token for voting from proposal metadata (onchain or Supabase)
  const [votingTokenAddress, setVotingTokenAddress] = useState<
    string | undefined
  >(ADVOCATE_ADDRESS);
  const [votingTokenABI, setVotingTokenABI] = useState<any>(
    AdvocateMembershipABI,
  );

  useEffect(() => {
    // If metadata specifies a token, use it
    if (
      metadata &&
      (metadata as any).token_id &&
      (metadata as any).contract_address
    ) {
      setVotingTokenAddress((metadata as any).contract_address);
      // TODO: Dynamically select ABI based on token type if needed
      setVotingTokenABI(AdvocateMembershipABI); // Default to AdvocateMembershipABI for now
    } else {
      setVotingTokenAddress(ADVOCATE_ADDRESS);
      setVotingTokenABI(AdvocateMembershipABI);
    }
  }, [metadata]);

  // Get voting power
  const { data: votingPower } = useReadContract({
    address: votingTokenAddress as `0x${string}`,
    abi: votingTokenABI,
    functionName: 'getVotes',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address && !!votingTokenAddress,
    },
  });

  // Define canVote: proposal must be active, user must have voting power, and not have already voted
  const canVote =
    proposalState === 1 && votingPower && Number(votingPower) > 0 && !hasVoted;

  // CDP transaction handler for voting
  const handleCDPVote = useCallback(async () => {
    if (!currentUser?.evmSmartAccounts?.[0]) {
      toast({
        title: 'Error',
        description: 'Smart Account not found',
        variant: 'destructive',
      });
      return;
    }

    if (selectedVote === null) {
      toast({
        title: 'Error',
        description: 'Please select a vote option',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);

    try {
      const smartAccount = currentUser.evmSmartAccounts[0];

      const callData = encodeFunctionData({
        abi: DAOGovernorABI,
        functionName: 'castVote',
        args: [proposalId, selectedVote],
      });

      console.log('🚀 CDP Vote:', {
        smartAccount,
        proposalId,
        voteType: selectedVote,
      });

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

      console.log('✅ Vote submitted:', result);

      toast({
        title: 'Vote cast successfully',
        description: 'Your vote has been recorded (gasless).',
        variant: 'success',
      });

      setHasVoted(true);

      if (address && proposalId) {
        try {
          await refreshNotifications();
        } catch (error) {
          console.error('Error refreshing notifications:', error);
        }
      }

      // Add a small delay to ensure API has time to update
      setTimeout(() => {
        onSuccess?.();
      }, 1000);
    } catch (error: any) {
      console.error('Vote failed:', error);
      toast({
        title: 'Voting failed',
        description: error.message || 'There was an error casting your vote.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentUser, proposalId, selectedVote, sendUserOperation, toast, address, refreshNotifications, onSuccess]);

  if (!address) {
    return (
      <div className="vote-form p-4">
        Please connect your wallet to vote on proposals.
      </div>
    );
  }

  const getProposalStateText = (state: number | undefined) => {
    if (state === undefined) return 'Unknown';
    if (state === -1) return 'State Unknown';

    const states = [
      'Pending',
      'Active',
      'Canceled',
      'Defeated',
      'Succeeded',
      'Queued',
      'Expired',
      'Executed',
    ];
    return states[state] || 'Unknown';
  };

  // Status badge color logic (match /vote/page.tsx)
  const getStatusBadgeStyle = (state: number | undefined) => {
    // Error state - red background
    if (state === -1) {
      return { backgroundColor: '#FEE2E2', color: '#991B1B' }; // Red
    }

    switch (state) {
      case 1:
        return { backgroundColor: '#E8F1EE', color: '#1F453A' }; // Active
      case 4:
        return { backgroundColor: '#D1E6DC', color: '#1F453A' }; // Passed
      case 3:
        return { backgroundColor: '#F5E6E6', color: '#5C1F1F' }; // Failed
      case 7:
        return { backgroundColor: '#EDEAF0', color: '#574C66' }; // Executed
      case 2:
        return { backgroundColor: '#f3f4f6', color: '#1f2937' }; // Canceled
      case 6:
        return { backgroundColor: '#FAF4EC', color: '#8F6B2F' }; // Expired
      case 5:
        return { backgroundColor: '#FAF4EC', color: '#A67E35' }; // Queued
      case 0:
        return { backgroundColor: '#f3f4f6', color: '#1f2937' }; // Pending
      default:
        return { backgroundColor: '#f3f4f6', color: '#1f2937' };
    }
  };

  return (
    <Card className="vote-form">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Cast Your Vote</span>
          <span
            className="ml-2 px-2 py-1 text-xs font-medium rounded-full"
            style={getStatusBadgeStyle(Number(proposalState))}
          >
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
              className="w-full py-2 px-4 text-white rounded-lg font-semibold cursor-not-allowed opacity-60"
              disabled={true}
              style={{ pointerEvents: 'none', backgroundColor: '#3F7A5A' }}
            >
              ✓ Voted
            </button>
            <p className="text-sm text-gray-500 mt-2">
              Thank you for participating in governance
            </p>
          </div>
        ) : (
          <>
            {proposalState === -1 ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">
                      Unable to determine proposal state
                    </p>
                    <p className="text-xs text-red-700 mt-1">
                      Cannot verify if this proposal is open for voting. Please
                      try refreshing the page or check back later.
                    </p>
                  </div>
                </div>
              </div>
            ) : proposalState !== 1 ? (
              <p className="text-center p-4 text-amber-600">
                This proposal is not currently active for voting
              </p>
            ) : (
              <>
                <div className="voting-power mb-4">
                  <p>
                    Your voting power:{' '}
                    <strong>
                      {votingPower ? votingPower.toString() : '0'}
                    </strong>
                  </p>
                </div>
                {(metadata as any)?.voting_end && (
                  <VotingCountdown votingEnd={(metadata as any).voting_end} />
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
                <button
                  onClick={handleCDPVote}
                  disabled={!canVote || selectedVote === null || isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Submitting Vote...' : 'Submit Vote'}
                </button>
                {!canVote &&
                  votingPower &&
                  BigInt(votingPower.toString()) === 0n && (
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

'use client';

import { useState, useEffect, useRef } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';
import { ProfileModal } from '@/features/identity/components/ProfileModal';
import Link from 'next/link';
import { ExternalLink, Clock, User, MessageSquare, Key } from 'lucide-react';
import '@/features/governance/styles/vote.css';
import { ProposalVoteForm } from '@/features/governance/components/ProposalVoteForm';
import VotingCountdown from '@/features/governance/components/VotingCountdown';
import '@/features/governance/styles/vote-modal.css';
import { useGovernanceParticipation } from '@/features/governance/hooks/useGovernanceParticipation';

interface ProposalMetadata {
  id: string;
  onchain_proposal_id?: string;
  title: string;
  description: string;
  proposer_address: string;
  forum_thread_id: string;
  token_id: string;
  created_at: string;
  transactionHash?: string;
  status?: string; // Added for proposal status
  voting_end?: string; // Added for voting end timestamp
}

interface Proposal {
  id: string;
  onchain_proposal_id?: string;
  title: string;
  description: string;
  proposer: {
    address: string;
    name: string;
    profile?: any; // Added for profile data
  };
  forumThreadId: string;
  tokenId: string;
  createdAt: Date;
  status: string;
  transactionHash?: string;
  voting_end?: string; // Added for voting end timestamp
}

// Map token_id to full pod name
const POD_NAMES: Record<string, string> = {
  exec: 'Executive Pod',
  dev: 'Dev Pod',
  poc: 'Proof of Curiosity',
  market: 'Market Admin',
  bounty: 'Bounty Hat',
};

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;

const PROPOSAL_STATES = [
  'Pending',
  'Active',
  'Canceled',
  'Defeated',
  'Succeeded',
  'Queued',
  'Expired',
  'Executed',
];

export default function VotePage() {
  const { evmAddress: address } = useEvmAddress();
  const isConnected = !!address;
  const { forceRefreshParticipation } = useGovernanceParticipation();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [profileUsers, setProfileUsers] = useState<any[]>([]);
  const [votingProposal, setVotingProposal] = useState<Proposal | null>(null);
  const [proposalStates, setProposalStates] = useState<
    Record<string, { state: number; hasVoted: boolean }>
  >({});
  const refreshInterval = useRef<NodeJS.Timeout | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'passed' | 'failed' | 'executed' | 'expired'
  >('active');

  // Add a cache for user profiles
  const userProfileCache: Record<string, any> = {};

  const fetchProposalStates = async (userAddress: string, force = false) => {
    if (!userAddress) return null;
    const url = force
      ? `/api/proposalStates?user=${userAddress}&force=true`
      : `/api/proposalStates?user=${userAddress}`;
    const res = await fetch(url);
    const data = await res.json();
    setProposalStates(data);
    return data; // returned so the burst poll can decide when to stop
  };

  useEffect(() => {
    if (!isConnected || !address) {
      setLoading(false);
      return;
    }

    const fetchProposals = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch proposal metadata
        const { data: proposalData, error: proposalError } = await supabase
          .from('proposal_metadata')
          .select('*')
          .order('created_at', { ascending: false });

        if (proposalError) {
          throw proposalError;
        }

        // Fetch all user profiles for modal lookup. Public columns only:
        // email is private and must not reach other members' clients.
        const { data: usersData } = await supabase
          .from('user_profiles')
          .select(
            'user_id, wallet_address, first_name, last_name, profile_picture, bio, website, twitter, discord, github, linkedin, tiktok, instagram, facebook, youtube, twitch, interests, seeking, open_to_connect',
          );
        setProfileUsers(usersData || []);

        // Transform the data and fetch user profiles separately
        const transformedProposals: Proposal[] = await Promise.all(
          (proposalData || []).map(async (proposal: ProposalMetadata) => {
            let proposerName =
              proposal.proposer_address.slice(0, 6) +
              '...' +
              proposal.proposer_address.slice(-4);
            let proposerProfile = null;
            try {
              const queryAddress = proposal.proposer_address.toLowerCase();
              if (userProfileCache[queryAddress]) {
                proposerProfile = userProfileCache[queryAddress];
              } else {
                const { data: userProfile } = await supabase
                  .from('user_profiles')
                  .select(
                    'first_name, last_name, wallet_address, profile_picture, bio, website, interests, seeking, open_to_connect, twitter, tiktok, instagram, facebook, discord, youtube, twitch, github, linkedin',
                  )
                  .eq('wallet_address', queryAddress)
                  .single();
                if (userProfile) {
                  userProfileCache[queryAddress] = userProfile;
                  proposerProfile = userProfile;
                }
              }
              if (proposerProfile) {
                const fullName =
                  `${proposerProfile.first_name || ''} ${proposerProfile.last_name || ''}`.trim();
                if (fullName) {
                  proposerName = fullName;
                }
              }
            } catch (error) {
              // Only log once per address
              if (!userProfileCache[proposal.proposer_address.toLowerCase()]) {
                console.log(
                  'Could not fetch user profile for:',
                  proposal.proposer_address,
                );
              }
            }
            return {
              id: proposal.id,
              onchain_proposal_id: proposal.onchain_proposal_id,
              title: proposal.title,
              description: proposal.description,
              proposer: {
                address: proposal.proposer_address,
                name: proposerName,
                profile: proposerProfile || {
                  wallet_address: proposal.proposer_address,
                },
              },
              forumThreadId: proposal.forum_thread_id,
              tokenId: proposal.token_id,
              createdAt: new Date(proposal.created_at),
              status: proposal.status || 'active', // Use the actual status from metadata
              transactionHash: proposal.transactionHash,
              voting_end: proposal.voting_end,
            };
          }),
        );

        setProposals(transformedProposals);

        // Fetch proposal states and hasVoted from API
        const res = await fetch(`/api/proposalStates?user=${address}`);
        const data = await res.json();
        setProposalStates(data);
      } catch (err) {
        console.error('Error fetching proposals:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load proposals',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchProposals();

    // Baseline refresh: slow poll so idle tabs don't hammer the RPC. Fast
    // near-real-time updates are handled by the burst poll below (and by
    // pollAfterVote(), triggered when the user actually casts a vote).
    if (refreshInterval.current) clearInterval(refreshInterval.current);
    refreshInterval.current = setInterval(() => {
      fetchProposalStates(address);
    }, 60 * 1000); // 60s baseline

    // Burst poll for PENDING proposals (state === 0): a self-terminating 2s
    // loop that re-evaluates each tick and STOPS once nothing is pending. The
    // previous version captured a stale snapshot and never stopped once started.
    let pendingInterval: ReturnType<typeof setInterval> | null = null;
    const stopPending = () => {
      if (pendingInterval) {
        clearInterval(pendingInterval);
        pendingInterval = null;
      }
    };
    pendingInterval = setInterval(async () => {
      const states = await fetchProposalStates(address);
      const stillPending =
        states &&
        Object.values(states).some((v: any) => v && v.state === 0);
      if (!stillPending) stopPending();
    }, 2000);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
      stopPending();
    };
  }, [isConnected, address]);

  const handleProposalClick = async (proposalId: string) => {
    // Mark governance notifications as read when viewing a proposal (not needed here)
  };

  const getBasescanUrl = (transactionHash: string) => {
    return `https://basescan.org/tx/${transactionHash}`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Helper to get the correct key for proposalStates
  const getProposalKey = (proposal: Proposal) =>
    proposal.onchain_proposal_id?.toString() || proposal.id?.toString();

  // Filter proposals based on status
  const filteredProposals = proposals.filter((proposal) => {
    if (statusFilter === 'all') return true;

    const proposalKey = getProposalKey(proposal);
    const state = proposalStates[proposalKey]?.state;
    switch (statusFilter) {
      case 'active':
        return state === 1; // Active
      case 'passed':
        return state === 4; // Succeeded/Passed
      case 'failed':
        return state === 3; // Defeated/Failed
      case 'executed':
        return state === 7; // Executed
      case 'expired':
        return state === 6; // Expired
      default:
        return true;
    }
  });

  // Get status counts for filter buttons
  const getStatusCount = (
    status: 'active' | 'passed' | 'failed' | 'executed' | 'expired',
  ) => {
    return proposals.filter((proposal) => {
      const proposalKey = getProposalKey(proposal);
      const state = proposalStates[proposalKey]?.state;
      switch (status) {
        case 'active':
          return state === 1;
        case 'passed':
          return state === 4;
        case 'failed':
          return state === 3;
        case 'executed':
          return state === 7;
        case 'expired':
          return state === 6;
        default:
          return false;
      }
    }).length;
  };

  if (!isConnected || !address) {
    return (
      <div className="min-h-screen bg-[#f5f4ed] p-4">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold mb-4 text-[#1F453A]">Governance Proposals</h1>
          <p className="text-[#5F5A54]">
            Please connect your wallet to view proposals.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f4ed] p-4">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-4 bg-[#E8F1EE] rounded w-3/4 mb-4"></div>
            <div className="h-4 bg-[#E8F1EE] rounded w-1/2 mb-4"></div>
            <div className="h-4 bg-[#E8F1EE] rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f4ed] p-4">
        <div className="max-w-6xl mx-auto">
          <p className="text-[#8B3A3A]">Error loading proposals: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-bg min-h-screen p-4 bottom-nav-spacing">
      <div className="max-w-6xl mx-auto pr-2">
        <div className="flex justify-center mb-8 mt-8">
          <div className="w-1/5" />
          <div className="flex-1 flex justify-center">
            <Link
              href="/governance"
              className="px-6 py-3 text-white rounded-lg transition-colors text-lg font-semibold shadow-md text-center hover:bg-[#254A40]"
              style={{ minWidth: 340, backgroundColor: '#2F5D50' }}
            >
              Create Proposal
            </Link>
          </div>
          <div className="w-1/5" />
        </div>

        {/* Status Filter Buttons */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'text-white'
                : 'bg-white text-[#5F5A54] hover:bg-[#E8F1EE] border border-[#D1C4A9]'
            }`}
            style={statusFilter === 'all' ? { backgroundColor: '#2F5D50' } : {}}
          >
            All ({proposals.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'active'
                ? 'text-white'
                : 'bg-white text-[#5F5A54] hover:bg-[#E8F1EE] border border-[#D1C4A9]'
            }`}
            style={
              statusFilter === 'active' ? { backgroundColor: '#2F5D50' } : {}
            }
          >
            Active ({getStatusCount('active')})
          </button>
          <button
            onClick={() => setStatusFilter('passed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'passed'
                ? 'text-white'
                : 'bg-white text-[#5F5A54] hover:bg-[#E8F1EE] border border-[#D1C4A9]'
            }`}
            style={
              statusFilter === 'passed' ? { backgroundColor: '#3F7A5A' } : {}
            }
          >
            Passed ({getStatusCount('passed')})
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'failed'
                ? 'text-white'
                : 'bg-white text-[#5F5A54] hover:bg-[#E8F1EE] border border-[#D1C4A9]'
            }`}
            style={
              statusFilter === 'failed' ? { backgroundColor: '#8B3A3A' } : {}
            }
          >
            Failed ({getStatusCount('failed')})
          </button>
          <button
            onClick={() => setStatusFilter('executed')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'executed'
                ? 'text-white'
                : 'bg-white text-[#5F5A54] hover:bg-[#E8F1EE] border border-[#D1C4A9]'
            }`}
            style={statusFilter === 'executed' ? { backgroundColor: '#1F453A' } : {}}
          >
            Executed ({getStatusCount('executed')})
          </button>
          <button
            onClick={() => setStatusFilter('expired')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === 'expired'
                ? 'text-white'
                : 'bg-white text-[#5F5A54] hover:bg-[#E8F1EE] border border-[#D1C4A9]'
            }`}
            style={statusFilter === 'expired' ? { backgroundColor: '#C6933F' } : {}}
          >
            Expired ({getStatusCount('expired')})
          </button>
        </div>

        {filteredProposals.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-[#8FAAA1] text-6xl mb-4">🗳️</div>
            <h2 className="text-xl font-semibold text-[#5F5A54] mb-2">
              No proposals yet
            </h2>
            <p className="text-[#8FAAA1]">
              Be the first to create a proposal for the DAO community to vote
              on.
            </p>
            <Link
              href="/governance"
              className="inline-block mt-4 px-6 py-2 text-white rounded-lg transition-colors hover:bg-[#254A40]"
              style={{ backgroundColor: '#2F5D50' }}
            >
              Create First Proposal
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredProposals.map((proposal) => (
              <div
                key={proposal.id}
                className="bg-white rounded-xl shadow-md border border-[#D1C4A9] hover:shadow-lg transition-shadow cursor-pointer relative"
                onClick={() => handleProposalClick(proposal.id)}
              >
                <div className="p-4">
                  {/* Title and Status */}
                  <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                    {proposal.title}
                    <span
                      className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${
                        proposalStates[getProposalKey(proposal)]?.state === 1
                          ? 'bg-[#E8F1EE] text-[#1F453A]' // Active
                          : proposalStates[getProposalKey(proposal)]?.state ===
                              4
                            ? 'bg-[#D1E6DC] text-[#1F453A]' // Succeeded/Passed
                            : proposalStates[getProposalKey(proposal)]
                                  ?.state === 3
                              ? 'bg-[#F5E6E6] text-[#5C1F1F]' // Defeated/Failed
                              : proposalStates[getProposalKey(proposal)]
                                    ?.state === 7
                                ? 'bg-[#D1E6DC] text-[#1F453A]' // Executed
                                : proposalStates[getProposalKey(proposal)]
                                      ?.state === 2
                                  ? 'bg-[#FAF4EC] text-[#8F6B2F]' // Canceled
                                  : proposalStates[getProposalKey(proposal)]
                                        ?.state === 6
                                    ? 'bg-[#FAF4EC] text-[#8F6B2F]' // Expired
                                    : proposalStates[getProposalKey(proposal)]
                                          ?.state === 5
                                      ? 'bg-[#FAF4EC] text-[#A67E35]' // Queued
                                      : proposalStates[getProposalKey(proposal)]
                                            ?.state === 0
                                        ? 'bg-[#E8F1EE] text-[#2F5D50]' // Pending
                                        : 'bg-[#E8F1EE] text-[#2F5D50]' // Unknown
                      }`}
                    >
                      {proposalStates[getProposalKey(proposal)]?.state !==
                        undefined &&
                      proposalStates[getProposalKey(proposal)]?.state >= 0
                        ? (() => {
                            const state =
                              proposalStates[getProposalKey(proposal)]?.state;
                            // Map contract states to user-friendly labels
                            switch (state) {
                              case 0:
                                return 'Pending';
                              case 1:
                                return 'Active';
                              case 2:
                                return 'Canceled';
                              case 3:
                                return 'Failed';
                              case 4:
                                return 'Passed';
                              case 5:
                                return 'Queued';
                              case 6:
                                return 'Expired';
                              case 7:
                                return 'Executed';
                              default:
                                return 'Unknown';
                            }
                          })()
                        : 'Unpublished'}
                    </span>
                  </h2>
                  {/* Icon Row */}
                  <div className="flex flex-col gap-2 mb-4 text-sm text-[#5F5A54]">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 mr-1" />
                      <span
                        className="hover:text-[#2F5D50] transition-colors font-medium cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProfile(proposal.proposer.profile);
                        }}
                      >
                        {proposal.proposer.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>{formatDate(proposal.createdAt)}</span>
                    </div>
                    {proposal.tokenId && (
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 mr-1 text-[#8FAAA1]" />
                        <span>
                          {POD_NAMES[proposal.tokenId] || proposal.tokenId}
                        </span>
                      </div>
                    )}
                    {proposal.forumThreadId && (
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 mr-1" />
                        <Link
                          href={`/forum/thread/${proposal.forumThreadId}`}
                          className="hover:text-[#2F5D50] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Discussion
                        </Link>
                      </div>
                    )}
                    {proposal.transactionHash && (
                      <div className="flex items-center gap-2">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        <a
                          href={getBasescanUrl(proposal.transactionHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#2F5D50] transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View on Basescan
                        </a>
                      </div>
                    )}
                  </div>
                  {/* Description */}
                  <div className="mb-4 text-[#5F5A54] text-sm line-clamp-4">
                    {proposal.description}
                  </div>
                  {/* Voting Countdown */}
                  {proposal.voting_end && (
                    <VotingCountdown votingEnd={proposal.voting_end} />
                  )}
                  {/* Vote Button: only enabled if proposal is Active and user hasn't voted */}
                  {proposalStates[getProposalKey(proposal)]?.state === 1 ? (
                    proposalStates[getProposalKey(proposal)]?.hasVoted ? (
                      <button
                        className="w-full py-2 px-4 text-white rounded-lg font-semibold cursor-not-allowed opacity-60"
                        disabled={true}
                        title="You have already voted on this proposal."
                        style={{
                          pointerEvents: 'none',
                          backgroundColor: '#3F7A5A',
                        }}
                      >
                        ✓ Voted
                      </button>
                    ) : (
                      <button
                        className="w-full py-2 px-4 text-white rounded-lg font-semibold transition-colors hover:bg-[#254A40]"
                        onClick={(e) => {
                          e.stopPropagation();
                          setVotingProposal(proposal);
                        }}
                        style={{ backgroundColor: '#2F5D50' }}
                      >
                        Vote
                      </button>
                    )
                  ) : (
                    <button
                      className="w-full py-2 px-4 bg-[#E8E4DC] text-[#8FAAA1] rounded-lg font-semibold cursor-not-allowed"
                      disabled={true}
                      title="Voting is only available for active proposals."
                    >
                      Vote (Not Active)
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Profile Modal */}
      {selectedProfile && (
        <ProfileModal
          user={selectedProfile}
          users={profileUsers}
          onClose={() => setSelectedProfile(null)}
        />
      )}
      {/* Voting Modal */}
      {votingProposal && (
        <div className="vote-modal-overlay">
          <div className="vote-modal-container" tabIndex={-1}>
            <button
              className="vote-modal-close"
              onClick={() => setVotingProposal(null)}
              aria-label="Close"
            >
              ✖
            </button>
            <ProposalVoteForm
              proposalId={
                votingProposal.onchain_proposal_id || votingProposal.id
              }
              proposalTitle={votingProposal.title}
              proposalState={
                proposalStates[getProposalKey(votingProposal)]?.state
              }
              hasVoted={
                proposalStates[getProposalKey(votingProposal)]?.hasVoted
              }
              onSuccess={async () => {
                // Immediately update local state to show "✓ Voted"
                const proposalKey = getProposalKey(votingProposal);
                setProposalStates((prev) => ({
                  ...prev,
                  [proposalKey]: {
                    ...prev[proposalKey],
                    hasVoted: true,
                  },
                }));
                // Force a fresh fetch from the API (bypass cache)
                await fetchProposalStates(address, true);
                // Force refresh participation data to update notification count
                forceRefreshParticipation();
                // Close the modal
                setVotingProposal(null);
                // Force a page refresh to ensure all components update
                window.location.reload();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

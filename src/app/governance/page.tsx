'use client';
import { useCallback, useState, useEffect } from 'react';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import CreateProposalForm from '@/features/governance/components/CreateProposalForm';
import VoteButton from '@/features/governance/components/VoteButton';
import { EnhancedVoteButton } from '@/features/governance/components/EnhancedVoteButton';
import { ProposalModal } from '@/features/governance/components/ProposalModal';
import { useEnhancedProposals } from '@/features/governance/hooks/useEnhancedProposals';
import { useGovernanceForumPosts } from '@/features/governance/hooks/useGovernanceForumPosts';
import type { EnhancedProposal } from '@/features/governance/hooks/useEnhancedProposals';
import { Badge } from '@/components/ui/badge';
import { Shield, FileText, Loader2, Clock } from 'lucide-react';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary/FeatureErrorBoundary';
import { supabase } from '@/utils/supabaseClient';

export default function GovernancePage() {
  const { address, isInitializing } = useCDPStatus();
  const [activeTab, setActiveTab] = useState<'vote' | 'propose'>('vote');
  const [selectedProposal, setSelectedProposal] = useState<EnhancedProposal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [proposalFilter, setProposalFilter] = useState<'all' | 'votable'>('votable');

  // Enhanced proposals that include both on-chain and pod proposals with HAT-based filtering
  const {
    data: enhancedProposals = [],
    isLoading: proposalsLoading,
    isError: proposalsError,
    error,
    refetch: refetchProposals,
  } = useEnhancedProposals();

  // Handle opening proposal modal
  const openProposalModal = (proposal: EnhancedProposal) => {
    setSelectedProposal(proposal);
    setIsModalOpen(true);
  };

  const closeProposalModal = () => {
    setIsModalOpen(false);
    setSelectedProposal(null);
  };

  // 2) Forum posts: dynamic based on dropdown selection
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const {
    data: posts = [],
    isLoading: postsLoading,
    isError: postsError,
  } = useGovernanceForumPosts(selectedCategoryId);

  // Replace this with your real categories source
  const categories = [
    { id: '00000000-0000-0000-0000-000000000001', name: 'General' },
    { id: '818a2a59-5d79-4ec4-8752-da87c480e7e9', name: 'Executive Pod' },
    { id: '92697690-0792-475a-918e-ccc085fbaf23', name: 'Dev Pod' },
    // …other forum categories
  ];

  // Called after a new proposal is successfully created
  const handleProposalCreated = useCallback(() => {
    refetchProposals();
  }, [refetchProposals]);

  // Filter proposals based on selected filter
  const filteredProposals = proposalFilter === 'all'
    ? enhancedProposals
    : enhancedProposals.filter(p => p.user_can_vote);

  // Fetch user profiles for proposal creators
  const [creatorProfiles, setCreatorProfiles] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const fetchCreatorProfiles = async () => {
      if (!enhancedProposals || enhancedProposals.length === 0) return;

      const addresses = enhancedProposals
        .map(p => p.created_by)
        .filter(addr => addr && !creatorProfiles.has(addr));

      if (addresses.length === 0) return;

      try {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('wallet_address, first_name, last_name, profile_picture')
          .in('wallet_address', addresses);

        if (error) throw error;

        if (data) {
          const profileMap = new Map(creatorProfiles);
          data.forEach(profile => {
            profileMap.set(profile.wallet_address.toLowerCase(), profile);
          });
          setCreatorProfiles(profileMap);
        }
      } catch (error) {
        console.error('Error fetching creator profiles:', error);
      }
    };

    fetchCreatorProfiles();
  }, [enhancedProposals]);

  // Debug logs removed - caused console spam with auto-refresh
  // console.log('enhanced proposals:', enhancedProposals);
  // console.log('governance forum posts:', posts);

  // Show loading while CDP initializes
  if (isInitializing) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Connecting wallet...</span>
      </div>
    );
  }

  return (
    <FeatureErrorBoundary featureName="Governance & Voting">
      <div
        className="min-h-screen"
        style={{
          backgroundImage: 'url(/images/chatbg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
        }}
      >
        <main className="max-w-4xl mx-auto p-4">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-800">Governance</h1>
            <p className="text-gray-700 mt-2">
              Create and vote on proposals. Available proposals are filtered based
              on your pod memberships.
            </p>
          </header>

          {/* Vote / Propose Toggle - PRIMARY (Dark Ritual Green) */}
          <div className="mb-4 flex justify-center">
            <div className="inline-flex rounded-lg bg-white shadow-md p-1">
              <button
                onClick={() => setActiveTab('vote')}
                className="px-6 py-2 rounded-md font-medium transition-all duration-200"
                style={{
                  backgroundColor: activeTab === 'vote' ? '#2F5D50' : 'transparent',
                  color: activeTab === 'vote' ? '#FFFFFF' : '#2F5D50',
                }}
              >
                Vote
              </button>
              <button
                onClick={() => setActiveTab('propose')}
                className="px-6 py-2 rounded-md font-medium transition-all duration-200"
                style={{
                  backgroundColor: activeTab === 'propose' ? '#2F5D50' : 'transparent',
                  color: activeTab === 'propose' ? '#FFFFFF' : '#2F5D50',
                }}
              >
                Propose
              </button>
            </div>
          </div>

          {/* Filter Toggle - Neutral Gray - Only show on Vote tab */}
          {activeTab === 'vote' && address && (
            <div className="mb-8 flex justify-center">
              <div className="inline-flex rounded-lg p-1" style={{ backgroundColor: '#E8EBF0' }}>
                <button
                  onClick={() => setProposalFilter('votable')}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: proposalFilter === 'votable' ? '#5B6B7D' : 'transparent',
                    color: proposalFilter === 'votable' ? '#FFFFFF' : '#7B8B9D',
                  }}
                >
                  My Proposals ({enhancedProposals.filter(p => p.user_can_vote).length})
                </button>
                <button
                  onClick={() => setProposalFilter('all')}
                  className="px-4 py-2 rounded-md text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: proposalFilter === 'all' ? '#5B6B7D' : 'transparent',
                    color: proposalFilter === 'all' ? '#FFFFFF' : '#7B8B9D',
                  }}
                >
                  All Proposals ({enhancedProposals.length})
                </button>
              </div>
            </div>
          )}

          {/* Proposals List */}
          {activeTab === 'vote' && (
            <section aria-label="Governance proposals">
          {!address && (
            <div className="text-center p-8 bg-white rounded-lg shadow-lg">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Connect your wallet to view available proposals
              </p>
            </div>
          )}

          {address && proposalsLoading && (
            <div className="text-center p-8 bg-white rounded-lg shadow-lg">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Loading proposals…</p>
            </div>
          )}
          {address && proposalsError && (
            <div className="text-center p-8 bg-white rounded-lg shadow-lg">
              <p className="text-red-600">
                Error loading proposals: {error?.message}
              </p>
            </div>
          )}
          {address &&
            !proposalsLoading &&
            !proposalsError &&
            filteredProposals.length === 0 && (
              <div className="text-center p-8 bg-white rounded-lg shadow-lg">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-700">
                  {proposalFilter === 'votable'
                    ? 'No proposals available for you to vote on'
                    : 'No proposals available'}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  {proposalFilter === 'votable'
                    ? 'You can view all proposals using the "All Proposals" filter above.'
                    : 'Check back later for new governance proposals.'}
                </p>
              </div>
            )}
          {address &&
            !proposalsLoading &&
            !proposalsError &&
            filteredProposals.length > 0 && (
              <ul className="space-y-6">
                {filteredProposals.map((proposal) => {
                  const creatorProfile = proposal.created_by
                    ? creatorProfiles.get(proposal.created_by.toLowerCase())
                    : null;
                  const creatorName = creatorProfile
                    ? `${creatorProfile.first_name || ''} ${creatorProfile.last_name || ''}`.trim()
                    : null;
                  const avatarUrl = creatorProfile?.profile_picture ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(creatorName || 'User')}&size=32&background=8FAAA1&color=fff&bold=true`;

                  // Helper function to truncate text
                  const truncateText = (text: string, maxLength: number) => {
                    if (text.length <= maxLength) return text;
                    return text.substring(0, maxLength).trim() + '...';
                  };

                  return (
                    <li
                      key={proposal.id}
                      className="proposal-card bg-white rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow cursor-pointer"
                      style={{
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
                      }}
                      onClick={() => openProposalModal(proposal)}
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-medium mb-3 hover:text-[#2F5D50] transition-colors">
                            {truncateText(proposal.title, 80)}
                          </h3>

                          {/* Inline labels: Category + Status */}
                          <div className="flex items-center gap-2 mb-2">
                            <Badge
                              variant={
                                proposal.type === 'governance'
                                  ? 'default'
                                  : proposal.type === 'pod_level'
                                  ? 'outline'
                                  : 'secondary'
                              }
                            >
                              {proposal.type === 'governance'
                                ? 'Governance'
                                : proposal.type === 'pod_level'
                                ? 'Pod Governance'
                                : 'Pod Creation'}
                            </Badge>
                            {proposal.status && (
                              <Badge variant="outline">{proposal.status}</Badge>
                            )}
                          </div>

                          {/* Role Required on separate line */}
                          {proposal.required_hat && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Shield className="h-4 w-4" />
                              <span className="font-medium">Role Required:</span>
                              <Badge variant="outline" className="text-xs">
                                Executive Pod
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(proposal.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <p className="mb-4 text-gray-700 line-clamp-3">
                        {truncateText(proposal.body, 200)}
                      </p>

                      {proposal.body.length > 200 && (
                        <button
                          className="text-sm text-[#2F5D50] hover:text-[#1F453A] font-medium mb-4"
                          onClick={(e) => {
                            e.stopPropagation();
                            openProposalModal(proposal);
                          }}
                        >
                          Read more →
                        </button>
                      )}

                      {/* Creator name card */}
                      {proposal.created_by && (
                        <div className="mb-4 flex items-center gap-2">
                          <img
                            src={avatarUrl}
                            alt={creatorName || 'Creator'}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                          <span className="text-sm text-gray-600">
                            <span className="font-medium">Created by:</span>{' '}
                            {creatorName || `${proposal.created_by.slice(0, 6)}...${proposal.created_by.slice(-4)}`}
                          </span>
                        </div>
                      )}

                      {/* Vote counts display - GRID LAYOUT */}
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 font-medium mb-2">Current Votes:</p>
                        <div className="grid grid-cols-4 gap-2">
                          {proposal.type === 'governance' ? (
                            // Governance proposals use scores array: [for, against, abstain]
                            <>
                              <div className="text-center p-2 bg-green-50 border border-green-200 rounded">
                                <p className="text-2xl font-bold text-green-700">
                                  {proposal.scores?.[0] || 0}
                                </p>
                                <p className="text-xs text-green-600 font-medium">For</p>
                              </div>
                              <div className="text-center p-2 bg-red-50 border border-red-200 rounded">
                                <p className="text-2xl font-bold text-red-700">
                                  {proposal.scores?.[1] || 0}
                                </p>
                                <p className="text-xs text-red-600 font-medium">Against</p>
                              </div>
                              <div className="text-center p-2 bg-gray-50 border border-gray-200 rounded">
                                <p className="text-2xl font-bold text-gray-700">
                                  {proposal.scores?.[2] || 0}
                                </p>
                                <p className="text-xs text-gray-600 font-medium">Abstain</p>
                              </div>
                              <div className="text-center p-2 bg-blue-50 border border-blue-200 rounded">
                                <p className="text-2xl font-bold text-blue-700">
                                  {((proposal.scores?.[0] || 0) + (proposal.scores?.[1] || 0) + (proposal.scores?.[2] || 0))}
                                </p>
                                <p className="text-xs text-blue-600 font-medium">Total</p>
                              </div>
                            </>
                          ) : (
                            // Pod creation proposals use vote_counts object
                            <>
                              <div className="text-center p-2 bg-green-50 border border-green-200 rounded">
                                <p className="text-2xl font-bold text-green-700">
                                  {(proposal as any).vote_counts?.for || 0}
                                </p>
                                <p className="text-xs text-green-600 font-medium">For</p>
                              </div>
                              <div className="text-center p-2 bg-red-50 border border-red-200 rounded">
                                <p className="text-2xl font-bold text-red-700">
                                  {(proposal as any).vote_counts?.against || 0}
                                </p>
                                <p className="text-xs text-red-600 font-medium">Against</p>
                              </div>
                              <div className="text-center p-2 bg-gray-50 border border-gray-200 rounded">
                                <p className="text-2xl font-bold text-gray-700">
                                  {(proposal as any).vote_counts?.abstain || 0}
                                </p>
                                <p className="text-xs text-gray-600 font-medium">Abstain</p>
                              </div>
                              <div className="text-center p-2 bg-blue-50 border border-blue-200 rounded">
                                <p className="text-2xl font-bold text-blue-700">
                                  {(proposal as any).vote_counts?.total || 0}
                                </p>
                                <p className="text-xs text-blue-600 font-medium">Total</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div
                        className="flex flex-wrap gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {proposal.status === 'proposed' && proposal.id?.startsWith('temp_') ? (
                          // Pending proposal - awaiting on-chain confirmation
                          <div className="w-full p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <div className="flex items-center gap-2 text-yellow-800">
                              <Clock className="h-4 w-4 animate-spin" />
                              <div className="flex-1">
                                <p className="text-sm font-medium">
                                  Awaiting Blockchain Confirmation
                                </p>
                                <p className="text-xs text-yellow-700 mt-1">
                                  Your proposal has been submitted and is being processed by the network.
                                  This usually takes 30-60 seconds. The page will automatically refresh once confirmed.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          // Confirmed proposal - show vote buttons
                          proposal.choices.map((choice, idx) =>
                            proposal.type === 'governance' ? (
                              <VoteButton
                                key={`${proposal.id}-${idx}`}
                                proposalId={proposal.id}
                                choice={idx + 1}
                                onVoteSuccess={refetchProposals}
                                voteCounts={{
                                  for: proposal.scores?.[0] || 0,
                                  against: proposal.scores?.[1] || 0,
                                  abstain: proposal.scores?.[2] || 0,
                                }}
                              />
                            ) : (
                              <EnhancedVoteButton
                                key={`${proposal.id}-${idx}`}
                                proposal={proposal}
                                choice={idx + 1}
                                onVoteSuccess={refetchProposals}
                              />
                            ),
                          )
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          )}

          {/* Create Proposal */}
          {activeTab === 'propose' && (
            <section aria-labelledby="create-proposal-heading">
              <CreateProposalForm onSuccess={handleProposalCreated} />
            </section>
          )}
        </main>

        {/* Proposal Detail Modal */}
        {selectedProposal && (
          <ProposalModal
            proposal={selectedProposal}
            isOpen={isModalOpen}
            onClose={closeProposalModal}
          />
        )}
      </div>
    </FeatureErrorBoundary>
  );
}

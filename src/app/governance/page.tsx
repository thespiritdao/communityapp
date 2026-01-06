'use client';
import { useCallback, useState } from 'react';
import { useCDPStatus } from '@/hooks/useCDPStatus';
import CreateProposalForm from '@/features/governance/components/CreateProposalForm';
import VoteButton from '@/features/governance/components/VoteButton';
import { EnhancedVoteButton } from '@/features/governance/components/EnhancedVoteButton';
import { useEnhancedProposals } from '@/features/governance/hooks/useEnhancedProposals';
import { useGovernanceForumPosts } from '@/features/governance/hooks/useGovernanceForumPosts';
import { Badge } from '@/components/ui/badge';
import { Shield, FileText, Loader2 } from 'lucide-react';
import { FeatureErrorBoundary } from '@/components/ErrorBoundary/FeatureErrorBoundary';

export default function GovernancePage() {
  const { address, isInitializing } = useCDPStatus();

  // Enhanced proposals that include both on-chain and pod proposals with HAT-based filtering
  const {
    data: enhancedProposals = [],
    isLoading: proposalsLoading,
    isError: proposalsError,
    error,
    refetch: refetchProposals,
  } = useEnhancedProposals();

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

  console.log('enhanced proposals:', enhancedProposals);
  console.log('governance forum posts:', posts);

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
      <main className="max-w-4xl mx-auto p-4">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Governance</h1>
          <p className="text-gray-600 mt-2">
            Create and vote on proposals. Available proposals are filtered based
            on your pod memberships.
          </p>
        </header>

        {/* Create Proposal */}
        <section aria-labelledby="create-proposal-heading" className="mb-12">
          <CreateProposalForm onSuccess={handleProposalCreated} />
        </section>

        {/* Active Proposals */}
        <section aria-labelledby="active-proposals-heading">
          <h2
            id="active-proposals-heading"
            className="text-2xl font-semibold mb-4"
          >
            Active Proposals
          </h2>
          {!address && (
            <div className="text-center p-8 border rounded-lg">
              <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">
                Connect your wallet to view available proposals
              </p>
            </div>
          )}

          {address && proposalsLoading && <p>Loading proposals…</p>}
          {address && proposalsError && (
            <p className="text-red-600">
              Error loading proposals: {error?.message}
            </p>
          )}
          {address &&
            !proposalsLoading &&
            !proposalsError &&
            enhancedProposals.length === 0 && (
              <div className="text-center p-8 border rounded-lg">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p>No proposals available for your current permissions</p>
                <p className="text-sm text-gray-500 mt-2">
                  Proposals are filtered based on your pod memberships and HAT
                  permissions
                </p>
              </div>
            )}
          {address &&
            !proposalsLoading &&
            !proposalsError &&
            enhancedProposals.length > 0 && (
              <ul className="space-y-6">
                {enhancedProposals.map((proposal) => (
                  <li
                    key={proposal.id}
                    className="proposal-card border rounded-lg p-6"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-medium mb-2">
                          {proposal.title}
                        </h3>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge
                            variant={
                              proposal.type === 'governance'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {proposal.type === 'governance'
                              ? 'Governance'
                              : 'Pod Creation'}
                          </Badge>
                          {proposal.status && (
                            <Badge variant="outline">{proposal.status}</Badge>
                          )}
                          {proposal.required_hat && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="h-3 w-3 mr-1" />
                              Executive Pod Required
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(proposal.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <p className="mb-4 whitespace-pre-wrap text-gray-700">
                      {proposal.body}
                    </p>

                    {/* Vote counts display */}
                    {proposal.type === 'pod_creation' && (
                      <div className="mb-4 flex items-center gap-4 text-sm">
                        <span className="text-gray-500">Current votes:</span>
                        <Badge variant="outline" className="bg-green-50">
                          For: {(proposal as any).vote_counts?.for || 0}
                        </Badge>
                        <Badge variant="outline" className="bg-red-50">
                          Against: {(proposal as any).vote_counts?.against || 0}
                        </Badge>
                        <Badge variant="outline" className="bg-gray-50">
                          Abstain: {(proposal as any).vote_counts?.abstain || 0}
                        </Badge>
                        <Badge variant="secondary">
                          Total: {(proposal as any).vote_counts?.total || 0}
                        </Badge>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {proposal.choices.map((choice, idx) =>
                        proposal.type === 'governance' ? (
                          <VoteButton
                            key={`${proposal.id}-${idx}`}
                            proposalId={Number(proposal.id)}
                            choice={idx + 1}
                          />
                        ) : (
                          <EnhancedVoteButton
                            key={`${proposal.id}-${idx}`}
                            proposal={proposal}
                            choice={idx + 1}
                            onVoteSuccess={refetchProposals}
                          />
                        ),
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </section>
      </main>
    </FeatureErrorBoundary>
  );
}

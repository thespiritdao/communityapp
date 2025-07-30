'use client';
import React, { useCallback, useState } from 'react';
import CreateProposalForm from 'src/features/governance/components/CreateProposalForm';
import VoteButton from 'src/features/governance/components/VoteButton';
import { useProposals } from 'src/features/governance/hooks/useProposals';
import { useGovernanceForumPosts } from 'src/features/governance/hooks/useGovernanceForumPosts';

export default function GovernancePage() {
  // 1) On‑chain proposals
  const {
    data: proposals = [],
    isLoading: proposalsLoading,
    isError: proposalsError,
    error,
    refetch: refetchProposals,
  } = useProposals();


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

  console.log('on‑chain proposals:', proposals);
  console.log('governance forum posts:', posts);

  return (
    <main className="max-w-4xl mx-auto p-4">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Governance</h1>
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
        {proposalsLoading && <p>Loading proposals…</p>}
        {proposalsError && (
          <p className="text-red-600">Error loading proposals: {error?.message}</p>
        )}
        {!proposalsLoading && !proposalsError && proposals.length === 0 && (
          <p>No proposals found. Be the first to create one!</p>
        )}
        {!proposalsLoading && !proposalsError && proposals.length > 0 && (
          <ul className="space-y-6">
            {proposals.map(({ id, title, body, choices }) => (
              <li key={id} className="proposal-card border rounded-lg p-4">
                <h3 className="text-xl font-medium mb-2">{title}</h3>
                <p className="mb-4 whitespace-pre-wrap">{body}</p>
                <div className="flex flex-wrap gap-2">
                  {choices.map((_, idx) => (
                    <VoteButton
                      key={`${id}-${idx}`}
                      proposalId={id}
                      choice={idx + 1}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

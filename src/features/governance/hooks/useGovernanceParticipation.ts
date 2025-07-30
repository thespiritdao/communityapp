import { useAccount } from 'wagmi';
import { useEffect, useState, useCallback } from 'react';
import { useProposals } from './useProposals';

export function useGovernanceParticipation() {
  const { address } = useAccount();
  const { data: proposals, isLoading: proposalsLoading } = useProposals();
  const [hasUnvotedProposals, setHasUnvotedProposals] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const checkVotes = useCallback(async () => {
    if (!address || !proposals || proposalsLoading) {
      setHasUnvotedProposals(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    
    try {
      // Fetch proposal states from API instead of direct onchain calls
      const res = await fetch(`/api/proposalStates?user=${address}`);
      if (!res.ok) throw new Error('Failed to fetch proposal states');
      const proposalStates = await res.json();
      
      // Filter for active proposals that user hasn't voted on
      const activeUnvotedProposals = proposals.filter((proposal: any) => {
        const proposalKey = proposal.onchain_proposal_id?.toString() || proposal.id?.toString();
        const state = proposalStates[proposalKey]?.state;
        const hasVoted = proposalStates[proposalKey]?.hasVoted;
        return state === 1 && !hasVoted; // Active and not voted
      });
      
      setHasUnvotedProposals(activeUnvotedProposals.length > 0);
      setLoading(false);
    } catch (error) {
      console.error('Error checking governance participation:', error);
      setHasUnvotedProposals(false);
      setLoading(false);
    }
  }, [address, proposals, proposalsLoading]);

  useEffect(() => {
    checkVotes();
  }, [checkVotes, refreshTrigger]);

  // Add a periodic refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const refreshParticipation = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  // Force immediate refresh (for use after voting)
  const forceRefreshParticipation = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { hasUnvotedProposals, loading, refreshParticipation, forceRefreshParticipation };
} 
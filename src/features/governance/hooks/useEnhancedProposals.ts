import { useQuery } from '@tanstack/react-query';
import { useAccount, usePublicClient } from 'wagmi';
import { useProposals } from './useProposals';
import { PodGovernanceService } from '@/features/pods/services/podGovernanceService';
import { GovernanceService } from '@/features/governance/services/governanceService';
import { POD_LEADER_HATS, HATS_CONFIG } from '@/features/pods/utils/podLeaderHats';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useGovernancePermission } from '@/hooks/useGovernancePermission';

export interface EnhancedProposal {
  id: string;
  title: string;
  body: string;
  type: 'governance' | 'pod_creation';
  start?: number;
  end?: number;
  choices: string[];
  scores?: number[];
  state?: number;
  status?: 'draft' | 'proposed' | 'active' | 'approved' | 'rejected' | 'executed';
  created_at: string;
  created_by?: string;
  pod_id?: string;
  pod_data?: any;
  user_can_vote: boolean;
  user_vote?: any;
  required_hat?: string;
  // ✅ NEW: Track which pod should approve this proposal
  approving_pod_id?: string; // Executive Pod for DAO-wide/top-level, Parent Pod for sub-pods
  governance_context?: 'dao-wide' | 'pod-level' | 'pod-creation';
}

// Minimal HATS ABI for checking balances
const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'hatId', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view'
  }
] as const;

export const useEnhancedProposals = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: onChainProposals = [], ...onChainQuery } = useProposals();
  const { canParticipateInGovernance, userRoles, hasPermission } = useHatPermissions();

  // ✅ ARCHITECTURE FIX: Check DAO-wide governance (Executive Pod) for on-chain proposals
  const { canParticipate: hasDAOGovernancePermission } = useGovernancePermission(undefined, 'dao-wide');

  return useQuery<EnhancedProposal[]>({
    queryKey: ['enhanced-proposals', address, hasDAOGovernancePermission, userRoles.length],
    queryFn: async (): Promise<EnhancedProposal[]> => {
      const allProposals: EnhancedProposal[] = [];

      // 1. Add on-chain governance proposals (DAO-wide, require Executive Pod permission)
      const execPodId = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;
      for (const proposal of onChainProposals) {
        allProposals.push({
          id: proposal.id,
          title: proposal.title,
          body: proposal.body,
          type: 'governance',
          start: proposal.start,
          end: proposal.end,
          choices: proposal.choices,
          scores: proposal.scores,
          state: proposal.state,
          created_at: new Date().toISOString(),
          user_can_vote: hasDAOGovernancePermission, // ✅ Executive Pod governance
          user_vote: null,
          approving_pod_id: execPodId,
          governance_context: 'dao-wide'
        });
      }

      // 2. Add pod creation proposals
      try {
        const pods = await PodGovernanceService.getPods();

        // Filter for pods that need governance approval
        const pendingPods = pods.filter(pod => {
          const status = (pod as any).status;
          // Include draft and proposed pods for governance voting
          return status === 'proposed' || status === 'draft';
        });

        // Check which proposals the user can vote on based on permissions
        const userVotableProposals = await Promise.all(
          pendingPods.map(async (pod) => {
            const podProposal = pod as any;

            // ✅ ARCHITECTURE FIX: Determine which pod should approve this creation
            // - Top-level pods (under Community Pod): Executive Pod approves
            // - Sub-pods (under existing pod): Parent pod approves
            const parentPodId = podProposal.parent_pod_id;
            const communityPodId = process.env.NEXT_PUBLIC_COMMUNITY_POD_ID;

            // If this is a top-level pod under Community Pod, Executive Pod must approve
            // Otherwise, parent pod members with governance permission can approve
            const isTopLevelPod = !parentPodId || parentPodId === communityPodId;
            const approvingPodId = isTopLevelPod
              ? process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID // Executive Pod
              : parentPodId; // Parent pod

            // Check if user has governance permission in the approving pod
            const approverRole = userRoles.find(role => role.podId === approvingPodId);
            const canVote = approverRole?.permissions?.governanceParticipation === true;

            console.log('🏛️ Pod Creation Vote Check:', {
              podName: pod.name,
              parentPodId,
              isTopLevelPod,
              approvingPodId,
              canVote,
              context: isTopLevelPod ? 'Executive Pod' : 'Parent Pod'
            });
            
            let userVote = null;
            if (address && canVote) {
              userVote = await GovernanceService.getUserVote(pod.id, address);
            }

            // Get vote counts for this pod proposal
            const votes = await GovernanceService.getProposalVotes(pod.id);
            const voteCount = {
              for: votes.filter(v => v.vote === 'for').length,
              against: votes.filter(v => v.vote === 'against').length,
              abstain: votes.filter(v => v.vote === 'abstain').length,
              total: votes.length
            };

            const proposal: EnhancedProposal = {
              id: pod.id,
              title: `Create Pod: ${pod.name}`,
              body: `**Pod Creation Proposal**\n\n${pod.description}\n\n**Pod Leads:** ${podProposal.pod_leads?.length || 0} member(s)\n\n**Parent Pod:** ${podProposal.parent_pod_id || 'Root'}\n\n**Created by:** ${podProposal.created_by_address || 'Unknown'}`,
              type: 'pod_creation',
              choices: ['Against', 'For', 'Abstain'],
              status: podProposal.status,
              created_at: pod.created_at,
              created_by: podProposal.created_by_address,
              pod_id: pod.id,
              pod_data: podProposal,
              user_can_vote: canVote,
              user_vote: userVote,
              required_hat: POD_LEADER_HATS.EXECUTIVE_POD_LEADER,
              // ✅ NEW: Include governance context
              approving_pod_id: approvingPodId,
              governance_context: 'pod-creation',
              vote_counts: voteCount
            } as EnhancedProposal & { vote_counts: typeof voteCount };

            return proposal;
          })
        );

        // Filter to only show proposals user can vote on OR has already voted on
        const relevantPodProposals = userVotableProposals.filter(proposal => 
          proposal.user_can_vote || proposal.user_vote
        );

        allProposals.push(...relevantPodProposals);
      } catch (error) {
        console.error('Failed to load pod proposals:', error);
      }

      // Sort by creation date, newest first
      return allProposals.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
    enabled: !!address, // Only run when user is connected
    staleTime: 30_000,
    refetchInterval: 60_000
  });
};
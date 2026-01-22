import { useQuery } from '@tanstack/react-query';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { useProposals } from './useProposals';
import { PodGovernanceService } from '@/features/pods/services/podGovernanceService';
import { GovernanceService } from '@/features/governance/services/governanceService';
import {
  POD_LEADER_HATS,
  HATS_CONFIG,
} from '@/features/pods/utils/podLeaderHats';
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
  status?:
    | 'draft'
    | 'proposed'
    | 'active'
    | 'approved'
    | 'rejected'
    | 'executed';
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
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export const useEnhancedProposals = () => {
  const { evmAddress: address } = useEvmAddress();
  const publicClient = usePublicClient();
  const { data: onChainProposals = [], isLoading: proposalsLoading, ...onChainQuery } = useProposals();
  const { canParticipateInGovernance, userRoles, hasPermission } =
    useHatPermissions();

  // ✅ ARCHITECTURE FIX: Check DAO-wide governance (Executive Pod) for on-chain proposals
  const { canParticipate: hasDAOGovernancePermission } =
    useGovernancePermission(undefined, 'dao-wide');

  // Create a permission hash to detect permission changes
  const permissionHash = userRoles
    .map(role => `${role.podId}:${role.permissions?.governanceParticipation}`)
    .sort()
    .join('|');

  return useQuery<EnhancedProposal[]>({
    queryKey: [
      'enhanced-proposals',
      address,
      hasDAOGovernancePermission,
      permissionHash, // ✅ FIX: Track actual permission values, not just array length
      onChainProposals.length,
    ],
    queryFn: async (): Promise<EnhancedProposal[]> => {
      console.log('🔄 [ENHANCED PROPOSALS] Starting query function');
      console.log('🔑 [ENHANCED PROPOSALS] Permission hash:', permissionHash);
      console.log('📥 [ENHANCED PROPOSALS] On-chain proposals:', onChainProposals.length);

      const allProposals: EnhancedProposal[] = [];

      // 1. Add on-chain governance proposals (DAO-wide, require Executive Pod permission)
      const execPodId = process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID;

      for (const proposal of onChainProposals) {
        // Use metadata.created_at if available (for pending proposals), otherwise use current time
        const createdAt = proposal.metadata?.created_at || new Date().toISOString();
        const proposalStatus = proposal.isPending ? 'proposed' : undefined;

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
          status: proposalStatus, // Mark pending proposals with status
          created_at: createdAt,
          user_can_vote: hasDAOGovernancePermission, // ✅ Executive Pod governance
          user_vote: null,
          approving_pod_id: execPodId,
          governance_context: 'dao-wide',
        });
      }

      // 2. Add pod creation proposals
      try {
        const pods = await PodGovernanceService.getPods();

        // Filter for pods that need governance approval
        const pendingPods = pods.filter((pod) => {
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
            const isTopLevelPod =
              !parentPodId || parentPodId === communityPodId;
            const approvingPodId = isTopLevelPod
              ? process.env.NEXT_PUBLIC_GOVERNANCE_POD_ID // Executive Pod
              : parentPodId; // Parent pod

            // Check if user has governance permission in the approving pod
            const approverRole = userRoles.find(
              (role) => role.podId === approvingPodId,
            );
            const canVote =
              approverRole?.permissions?.governanceParticipation === true;

            console.log('🏛️ [POD VOTE CHECK]', {
              podName: pod.name,
              approvingPodId,
              approverRole: approverRole ? `Found (${approverRole.role_name})` : 'Not found',
              governancePermission: approverRole?.permissions?.governanceParticipation,
              canVote,
            });

            let userVote = null;
            if (address && canVote) {
              try {
                userVote = await GovernanceService.getUserVote(pod.id, address);
              } catch (error: any) {
                // Silently handle getUserVote errors (406, etc) to prevent session disruption
                console.log('Skipping vote check for pod:', pod.id, '- error:', error.code || error.message);
                userVote = null;
              }
            }

            // Get vote counts for this pod proposal
            let voteCount = {
              for: 0,
              against: 0,
              abstain: 0,
              total: 0,
            };

            try {
              const votes = await GovernanceService.getProposalVotes(pod.id);
              voteCount = {
                for: votes.filter((v) => v.vote === 'for').length,
                against: votes.filter((v) => v.vote === 'against').length,
                abstain: votes.filter((v) => v.vote === 'abstain').length,
                total: votes.length,
              };
            } catch (error: any) {
              // Silently handle vote count errors to prevent session disruption
              console.log('Could not fetch votes for pod:', pod.id, '- using zeros');
            }

            const proposal: EnhancedProposal = {
              id: pod.id,
              title: pod.name,
              body: pod.description || 'No description provided.',
              type: 'pod_creation',
              choices: ['For', 'Against', 'Abstain'],
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
              vote_counts: voteCount,
            } as EnhancedProposal & { vote_counts: typeof voteCount };

            return proposal;
          }),
        );

        // ✅ TRANSPARENCY FIX: Show ALL pod proposals (filter happens at page level)
        // The page-level filter toggle will handle "My Proposals" vs "All Proposals"
        allProposals.push(...userVotableProposals);
      } catch (error) {
        console.error('Failed to load pod proposals:', error);
      }

      // Sort by creation date, newest first
      const sortedProposals = allProposals.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      // console.log(`🎯 useEnhancedProposals: Returning ${sortedProposals.length} total proposals`);
      // console.log('📊 Proposal breakdown:', {
      //   governance: sortedProposals.filter(p => p.type === 'governance').length,
      //   podCreation: sortedProposals.filter(p => p.type === 'pod_creation').length,
      //   pending: sortedProposals.filter(p => p.status === 'proposed').length,
      // });

      return sortedProposals;
    },
    enabled: !!address && !proposalsLoading, // Wait for useProposals to finish loading
    staleTime: 5_000, // 5 seconds - shorter to reflect permission changes quickly
    refetchInterval: 30_000, // 30 seconds - balance between freshness and load
  });
};

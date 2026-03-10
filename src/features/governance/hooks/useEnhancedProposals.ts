import { useQuery } from '@tanstack/react-query';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { usePublicClient } from 'wagmi';
import { useProposalsV3 } from './useProposalsV3'; // ✅ V3: Database-first architecture
import { PodGovernanceService } from '@/features/pods/services/podGovernanceService';
import { GovernanceService } from '@/features/governance/services/governanceService';
import {
  POD_LEADER_HATS,
  HATS_CONFIG,
} from '@/features/pods/utils/podLeaderHats';
import { useHatPermissions } from '@/hooks/useHatPermissions';
import { useGovernancePermission } from '@/hooks/useGovernancePermission';
import { CONTRACT_ADDRESSES } from '@/config/contracts';

export interface EnhancedProposal {
  id: string;
  title: string;
  body: string;
  type: 'governance' | 'pod_creation' | 'pod_level'; // ✅ NEW: pod-level proposals
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
  // ✅ Track which pod should approve this proposal
  approving_pod_id?: string; // Specific pod for pod-level, Executive Pod for DAO-wide, Parent Pod for pod-creation
  governance_context?: 'dao-wide' | 'pod-level' | 'pod-creation';
  governance_tier?: 'DAO_CONSTITUTIONAL' | 'POD_TREASURY_BINDING' | 'POD_OPERATIONAL';
  // ✅ Advocate token gating: DAO_CONSTITUTIONAL proposals require Advocate ERC-721
  is_advocate_gated?: boolean;
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
  // ✅ V3: Using database-first architecture for 90% faster load times
  const { data: onChainProposals = [], isLoading: proposalsLoading, ...onChainQuery } = useProposalsV3();
  const { canParticipateInGovernance, userRoles, hasPermission } =
    useHatPermissions();

  // Create a permission hash to detect permission changes
  const permissionHash = userRoles
    .map(role => `${role.podId}:${role.permissions?.governanceParticipation}`)
    .sort()
    .join('|');

  return useQuery<EnhancedProposal[]>({
    queryKey: [
      'enhanced-proposals',
      address,
      permissionHash, // ✅ FIX: Track actual permission values, not just array length
      onChainProposals.length,
    ],
    queryFn: async (): Promise<EnhancedProposal[]> => {
      console.log('🔄 [ENHANCED PROPOSALS] Starting query function');
      console.log('🔑 [ENHANCED PROPOSALS] Permission hash:', permissionHash);
      console.log('📥 [ENHANCED PROPOSALS] On-chain proposals:', onChainProposals.length);

      const allProposals: EnhancedProposal[] = [];

      // 1. Add on-chain governance proposals
      // Routing is determined by token_id in proposal_metadata:
      //   'dao-wide' (or missing) → DAO_CONSTITUTIONAL, any Advocate ERC-721 holder can vote
      //   <pod-uuid>              → POD_TREASURY_BINDING, only that pod's members can vote
      const ADVOCATE_TOKEN = CONTRACT_ADDRESSES.ADVOCATE_TOKEN;
      const onChainProposalsToAdd: EnhancedProposal[] = [];

      // Check if user holds Advocate token (single call, reused for all DAO-wide proposals)
      let userHasAdvocate = false;
      if (address && ADVOCATE_TOKEN && publicClient) {
        try {
          const ERC721_BALANCE_ABI = [{
            name: 'balanceOf',
            type: 'function',
            inputs: [{ name: 'owner', type: 'address' }],
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
          }] as const;
          const balance = await publicClient.readContract({
            address: ADVOCATE_TOKEN,
            abi: ERC721_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [address as `0x${string}`],
          });
          userHasAdvocate = BigInt(balance as bigint) > 0n;
        } catch {
          // RPC failure — default to false, user won't see vote buttons
        }
      }

      for (const proposal of onChainProposals) {
        const createdAt = proposal.metadata?.created_at || new Date().toISOString();
        const proposalStatus = proposal.isPending ? 'proposed' : undefined;
        const tokenId = proposal.metadata?.token_id as string | undefined;

        // Determine governance scope from token_id
        const isDaoWide = !tokenId || tokenId === 'dao-wide';
        const podUuid = isDaoWide ? undefined : tokenId;

        // Determine if user can vote
        let userCanVote: boolean;
        let approvingPodId: string | undefined;
        let governanceContext: 'dao-wide' | 'pod-level';
        let governanceTier: 'DAO_CONSTITUTIONAL' | 'POD_TREASURY_BINDING';

        if (isDaoWide) {
          // DAO_CONSTITUTIONAL: any Advocate holder votes
          userCanVote = userHasAdvocate;
          approvingPodId = undefined;
          governanceContext = 'dao-wide';
          governanceTier = 'DAO_CONSTITUTIONAL';
        } else {
          // POD_TREASURY_BINDING: only pod members vote
          const podRole = userRoles.find(role => role.podId === podUuid);
          userCanVote = podRole?.permissions?.governanceParticipation === true;
          approvingPodId = podUuid;
          governanceContext = 'pod-level';
          governanceTier = 'POD_TREASURY_BINDING';
        }

        onChainProposalsToAdd.push({
          id: proposal.id,
          title: proposal.title,
          body: proposal.body,
          type: 'governance',
          start: proposal.start,
          end: proposal.end,
          choices: proposal.choices,
          scores: proposal.scores,
          state: proposal.state,
          status: proposalStatus,
          created_at: createdAt,
          created_by: proposal.metadata?.proposer_address,
          user_can_vote: userCanVote,
          user_vote: null,
          approving_pod_id: approvingPodId,
          governance_context: governanceContext,
          governance_tier: governanceTier,
          is_advocate_gated: isDaoWide,
          pod_id: podUuid,
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

            // ✅ TOKEN-GATING: Only show pod creation proposals to users who can vote on them
            if (!canVote) {
              console.log(`🔒 [TOKEN-GATE] Hiding pod creation proposal "${pod.name}" - user lacks approver token`);
              return null; // Will be filtered out
            }

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

        // ✅ TOKEN-GATING: Filter out null entries (proposals user can't vote on)
        const visiblePodProposals = userVotableProposals.filter(p => p !== null);
        allProposals.push(...visiblePodProposals);
        console.log(`✅ Loaded ${visiblePodProposals.length} pod creation proposals (${userVotableProposals.length - visiblePodProposals.length} hidden due to token-gating)`);
      } catch (error) {
        console.error('Failed to load pod proposals:', error);
      }

      // 3. Add pod-level proposals (pod-specific governance)
      try {
        const podLevelProposals = await GovernanceService.getPodLevelProposals();

        // ✅ FIX: Filter out expired proposals based on voting_deadline
        const activeProposals = podLevelProposals.filter(p => {
          if (!p.voting_deadline) return true; // No deadline = always active
          return new Date(p.voting_deadline) >= new Date(); // Not expired
        });

        console.log(`📋 [POD-LEVEL] Filtered ${podLevelProposals.length} proposals → ${activeProposals.length} active (${podLevelProposals.length - activeProposals.length} expired)`);

        // ✅ DEBUG: Check what onchain_proposal_id values we have
        console.log(`🔍 [DEBUG] Pod-level proposals with onchain IDs:`, activeProposals.map(p => ({
          title: p.title,
          onchain_proposal_id: p.onchain_proposal_id,
          hasId: !!p.onchain_proposal_id,
          isTemp: p.onchain_proposal_id?.startsWith('temp_')
        })));

        // ✅ DEDUPLICATION: Collect onchain_proposal_ids from pod-level proposals
        // so we can filter them out from the on-chain list later.
        // Also collect transaction_hashes to catch rows whose onchain_proposal_id
        // was never updated from the temp_ value after on-chain confirmation.
        const podLevelOnchainIds = new Set(
          activeProposals
            .map(p => p.onchain_proposal_id)
            .filter(id => id && !id.startsWith('temp_')) // Exclude temporary IDs
        );
        const podLevelTxHashes = new Set(
          activeProposals
            .map(p => p.transaction_hash)
            .filter(Boolean)
        );

        console.log(`🔍 [DEDUP] Pod-level onchain IDs to filter:`, Array.from(podLevelOnchainIds));
        console.log(`🔍 [DEDUP] On-chain proposals before filtering:`, onChainProposalsToAdd.map(p => ({ id: p.id, title: p.title })));

        for (const proposal of activeProposals) {
          // Check if user has governance permission in this specific pod
          const podRole = userRoles.find(
            (role) => role.podId === proposal.pod_id,
          );
          const canVote =
            podRole?.permissions?.governanceParticipation === true;

          console.log('🏛️ [POD-LEVEL VOTE CHECK]', {
            proposalTitle: proposal.title,
            podId: proposal.pod_id,
            podName: proposal.pods?.name,
            userRole: podRole ? `Found (${podRole.role_name})` : 'Not found',
            governancePermission: podRole?.permissions?.governanceParticipation,
            canVote,
          });

          // Get user's vote if they can vote
          let userVote = null;
          if (address && canVote) {
            try {
              userVote = await GovernanceService.getUserVote(proposal.id, address);
            } catch (error: any) {
              console.log('Skipping vote check for pod-level proposal:', proposal.id, '- error:', error.code || error.message);
              userVote = null;
            }
          }

          // ✅ TOKEN-GATING: Only show pod-level proposals to users who have the appropriate token/hat
          // Skip this proposal if user doesn't have governance permission in this pod
          if (!canVote) {
            console.log(`🔒 [TOKEN-GATE] Hiding pod-level proposal "${proposal.title}" - user lacks pod token`);
            continue; // Skip this proposal, continue with next
          }

          const enhancedProposal: EnhancedProposal = {
            id: proposal.id,
            title: proposal.title,
            body: proposal.description,
            type: 'pod_level',
            choices: proposal.metadata?.choices || ['For', 'Against', 'Abstain'],
            status: proposal.status as any,
            created_at: proposal.created_at,
            created_by: proposal.created_by,
            pod_id: proposal.pod_id,
            pod_data: proposal.pods,
            user_can_vote: canVote,
            user_vote: userVote,
            approving_pod_id: proposal.pod_id, // Same pod votes
            governance_context: 'pod-level',
            governance_tier: proposal.governance_tier ?? 'POD_OPERATIONAL',
            vote_counts: proposal.vote_counts,
          } as EnhancedProposal & { vote_counts: typeof proposal.vote_counts };

          allProposals.push(enhancedProposal);
        }

        console.log(`✅ Loaded ${activeProposals.length} active pod-level proposals (${podLevelProposals.length} total, ${podLevelProposals.length - activeProposals.length} expired)`);

        // ✅ DEDUPLICATION: Now filter out on-chain proposals that are already in pod-level.
        // Match on onchain_proposal_id first; fall back to transaction_hash for rows where
        // the temp_ ID was never resolved (legacy data from the dual-write era).
        const filteredOnChainProposals = onChainProposalsToAdd.filter(proposal => {
          const idMatch = podLevelOnchainIds.has(proposal.id);
          const txMatch = proposal.metadata?.transaction_hash
            ? podLevelTxHashes.has(proposal.metadata.transaction_hash)
            : false;
          const isDuplicate = idMatch || txMatch;
          if (isDuplicate) {
            console.log(`🔍 [DEDUP] Filtered out duplicate on-chain proposal: ${proposal.title} (ID: ${proposal.id})`);
          }
          return !isDuplicate;
        });

        allProposals.push(...filteredOnChainProposals);
        console.log(`✅ Added ${filteredOnChainProposals.length} DAO-wide proposals (${onChainProposalsToAdd.length - filteredOnChainProposals.length} duplicates removed)`);
      } catch (error) {
        console.error('Failed to load pod-level proposals:', error);
        // If pod-level load failed, add all on-chain proposals anyway
        allProposals.push(...onChainProposalsToAdd);
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
    staleTime: 30_000, // 30 seconds - cache to reduce load
    refetchInterval: false, // Disable auto-refresh - rely on parent query refetch
  });
};

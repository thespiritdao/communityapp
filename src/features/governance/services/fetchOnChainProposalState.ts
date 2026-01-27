// Production-ready on-chain state fetching
// Only fetches state for specific proposals (no block scanning)

import type { PublicClient } from 'viem';
import DAOGovernorABI from '@/abis/DAO_GovernorABI.json';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import type { ProposalMetadata } from './fetchProposalsFromDatabase';

const GOVERNOR_ADDRESS = CONTRACT_ADDRESSES.DAO_GOVERNOR as `0x${string}`;

export interface OnChainProposalState {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  state: number;
  stateError: boolean;
  choices: string[];
  scores: number[];
  metadata: ProposalMetadata;
}

/**
 * Fetch on-chain state for a specific proposal
 * This is called ONLY for proposals we know exist in the database
 */
async function fetchProposalState(
  publicClient: PublicClient,
  metadata: ProposalMetadata
): Promise<OnChainProposalState | null> {
  const proposalId = BigInt(metadata.onchain_proposal_id);

  try {
    // Fetch all on-chain data in parallel (minimal RPC calls)
    const [startBlock, endBlock, state] = await Promise.all([
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: DAOGovernorABI,
        functionName: 'proposalSnapshot',
        args: [proposalId],
        blockTag: 'latest',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: DAOGovernorABI,
        functionName: 'proposalDeadline',
        args: [proposalId],
        blockTag: 'latest',
      }) as Promise<bigint>,
      publicClient.readContract({
        address: GOVERNOR_ADDRESS,
        abi: DAOGovernorABI,
        functionName: 'state',
        args: [proposalId],
        blockTag: 'latest',
      }) as Promise<number>,
    ]);

    return {
      id: metadata.onchain_proposal_id,
      title: metadata.title || 'Untitled Proposal',
      body: metadata.description || '',
      start: Number(startBlock),
      end: Number(endBlock),
      state,
      stateError: false,
      choices: ['For', 'Against', 'Abstain'],
      scores: [0, 0, 0], // Will be populated from governance_proposal_votes
      metadata,
    };
  } catch (error) {
    console.error(`❌ Failed to fetch on-chain state for proposal ${metadata.title}:`, error);

    // Return proposal with error state instead of null
    // This ensures proposals show up even if RPC fails
    return {
      id: metadata.onchain_proposal_id,
      title: metadata.title || 'Untitled Proposal',
      body: metadata.description || '',
      start: 0,
      end: 0,
      state: -1,
      stateError: true,
      choices: ['For', 'Against', 'Abstain'],
      scores: [0, 0, 0],
      metadata,
    };
  }
}

/**
 * Batch fetch on-chain state for multiple proposals
 * Returns only successfully fetched proposals
 */
export async function fetchOnChainStates(
  publicClient: PublicClient | undefined,
  proposals: ProposalMetadata[]
): Promise<OnChainProposalState[]> {
  if (!publicClient) {
    console.warn('⚠️ No public client available');
    return [];
  }

  if (proposals.length === 0) {
    console.log('📭 No proposals to fetch on-chain state for');
    return [];
  }

  console.log(`⛓️ [PRODUCTION] Fetching on-chain state for ${proposals.length} proposals...`);

  // Fetch all proposals in parallel
  const results = await Promise.all(
    proposals.map(meta => fetchProposalState(publicClient, meta))
  );

  // Filter out null results (failed fetches already handled with error state)
  const successfulResults = results.filter((p): p is OnChainProposalState => p !== null);

  console.log(`✅ Successfully fetched ${successfulResults.length}/${proposals.length} proposals`);

  return successfulResults;
}

/**
 * Convert pending proposal metadata to display format
 * These proposals don't have on-chain state yet
 */
export function pendingProposalToDisplayFormat(metadata: ProposalMetadata): OnChainProposalState {
  return {
    id: metadata.onchain_proposal_id,
    title: metadata.title || 'Untitled Proposal',
    body: metadata.description || '',
    start: 0,
    end: 0,
    state: -1, // Pending state
    stateError: false,
    choices: ['For', 'Against', 'Abstain'],
    scores: [0, 0, 0],
    metadata,
  };
}

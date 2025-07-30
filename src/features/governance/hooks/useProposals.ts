// src/features/governance/hooks/useProposals.ts
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { keccak256, decodeEventLog } from 'viem';
import DAOGovernorABI from '../../../abis/DAO_GovernorABI.json';
import { base } from 'viem/chains';
import { supabase } from '../../../utils/supabaseClient';

interface Proposal {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  choices: string[];
  scores: number[];
  state: number; // Add state field
}

const GOVERNOR_ADDRESS = process.env.NEXT_PUBLIC_DAO_GOVERNOR as `0x${string}`;
const PROPOSAL_CREATED_TOPIC = keccak256(
  'ProposalCreated(uint256,address,address[],uint256[],bytes[],uint64,uint64,string)'
);

const fetchProposalsOnChain = async (publicClient: ReturnType<typeof usePublicClient>): Promise<Proposal[]> => {
  // 1) Fetch ProposalCreated logs
  const logs = await publicClient.getLogs({
    chainId: base.id,
    address: GOVERNOR_ADDRESS,
    topics: [PROPOSAL_CREATED_TOPIC],
  });

  // 2) Decode each log to extract id & description
  const eventAbi = DAOGovernorABI.find(
    (item) => item.type === 'event' && item.name === 'ProposalCreated'
  )!;
  const decoded = logs.map((log) =>
    decodeEventLog({
      abi: [eventAbi],
      data: log.data,
      topics: log.topics,
    })
  );

  const proposals: Proposal[] = [];
  for (const ev of decoded) {
    const id = Number((ev.args as any).proposalId);
    const description = (ev.args as any).description as string;

    // 3) Read on‑chain proposal core data
    const core = await publicClient.readContract({
      chainId: base.id,
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'proposals',
      args: [BigInt(id)],
    }) as {
      proposer: `0x${string}`;
      startBlock: bigint;
      endBlock: bigint;
      forVotes: bigint;
      againstVotes: bigint;
      abstainVotes: bigint;
      executed: boolean;
      canceled: boolean;
    };

    // 4) Get proposal state
    let state = 0; // Default to Pending
    try {
      state = await publicClient.readContract({
        chainId: base.id,
        address: GOVERNOR_ADDRESS,
        abi: DAOGovernorABI,
        functionName: 'state',
        args: [BigInt(id)],
      }) as number;
    } catch (error) {
      console.error(`Error fetching state for proposal ${id}:`, error);
      // If we can't get the state, assume it's active (state 1)
      state = 1;
    }

    // 5) Parse title/body from the markdown description
    const parts = description.split('\n\n');
    const title = parts[0].replace(/^#\s*/, '');
    const body = parts[1] || '';

    // 6) Use on‑chain tallies for scores
    const choices = ['Against', 'For', 'Abstain'];
    const scores = [
      Number(core.againstVotes),
      Number(core.forVotes),
      Number(core.abstainVotes),
    ];

    proposals.push({
      id: id.toString(),
      title,
      body,
      start: Number(core.startBlock),
      end: Number(core.endBlock),
      choices,
      scores,
      state, // Include the state
    });
  }

  return proposals;
};

export const useProposals = () => {
  const publicClient = usePublicClient();
  return useQuery<any[]>({
    queryKey: ['proposals', GOVERNOR_ADDRESS],
    queryFn: async () => {
      const onChainProposals = await fetchProposalsOnChain(publicClient);
      const { data: metadata } = await supabase
        .from('proposal_metadata')
        .select('*')
        .in('onchain_proposal_id', onChainProposals.map(p => p.id));
      return onChainProposals.map(proposal => ({
        ...proposal,
        metadata: metadata?.find(m => m.onchain_proposal_id === proposal.id) || null
      }));
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000
  });
};

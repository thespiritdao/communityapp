// src/features/governance/hooks/useProposals.ts
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { decodeEventLog } from 'viem';
import DAOGovernorABI from '@/abis/DAO_GovernorABI.json';
import { supabase } from '@/utils/supabaseClient';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import { retryContractRead } from '@/utils/contractReadRetry';

interface Proposal {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  choices: string[];
  scores: number[];
  state: number; // -1 = Error/Unknown, 0-7 = Valid states
  stateError?: boolean; // Flag indicating state fetch failed
}

const GOVERNOR_ADDRESS = CONTRACT_ADDRESSES.DAO_GOVERNOR;

const fetchProposalsOnChain = async (
  publicClient: ReturnType<typeof usePublicClient>,
): Promise<Proposal[]> => {
  if (!publicClient) {
    console.warn('publicClient is undefined, returning empty proposals');
    return [];
  }

  // 1) Get event ABI for type-safe filtering
  const eventAbi = DAOGovernorABI.find(
    (item) => item.type === 'event' && item.name === 'ProposalCreated',
  )!;

  // 2) Fetch ProposalCreated logs
  const logs = await publicClient.getLogs({
    address: GOVERNOR_ADDRESS,
    event: eventAbi,
  });
  const decoded = logs.map((log) =>
    decodeEventLog({
      abi: [eventAbi],
      data: log.data,
      topics: log.topics,
    }),
  );

  const proposals: Proposal[] = [];
  for (const ev of decoded) {
    const id = Number((ev.args as any).proposalId);
    const description = (ev.args as any).description as string;

    // 3) Read on‑chain proposal core data
    const core = (await publicClient.readContract({
      address: GOVERNOR_ADDRESS,
      abi: DAOGovernorABI,
      functionName: 'proposals',
      args: [BigInt(id)],
    })) as {
      proposer: `0x${string}`;
      startBlock: bigint;
      endBlock: bigint;
      forVotes: bigint;
      againstVotes: bigint;
      abstainVotes: bigint;
      executed: boolean;
      canceled: boolean;
    };

    // 4) Get proposal state with retry logic
    let state = -1; // Default to Unknown/Error state
    let stateError = false;

    try {
      state = await retryContractRead(
        () =>
          publicClient.readContract({
            chainId: base.id,
            address: GOVERNOR_ADDRESS,
            abi: DAOGovernorABI,
            functionName: 'state',
            args: [BigInt(id)],
          }) as Promise<number>,
        {
          retries: 3,
          initialDelay: 500,
          onRetry: (error, attempt) => {
            console.warn(
              `[Proposal ${id}] Retry ${attempt}/3 - Failed to fetch state:`,
              error.message,
            );
          },
        },
      );

      console.log(`[Proposal ${id}] State fetched successfully: ${state}`);
    } catch (error) {
      console.error(
        `[Proposal ${id}] Failed to fetch state after 3 retries:`,
        error,
      );

      // Mark as error state instead of assuming it's active
      // This prevents misleading users about proposal status
      state = -1;
      stateError = true;
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
      state, // Include the state (-1 if error, 0-7 if valid)
      stateError, // Flag if state fetch failed
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
        .in(
          'onchain_proposal_id',
          onChainProposals.map((p) => p.id),
        );
      return onChainProposals.map((proposal) => ({
        ...proposal,
        metadata:
          metadata?.find((m) => m.onchain_proposal_id === proposal.id) || null,
      }));
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
};

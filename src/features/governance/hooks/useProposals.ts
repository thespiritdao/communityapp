// src/features/governance/hooks/useProposals.ts
import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { decodeEventLog, type AbiEvent, parseAbiItem, parseEventLogs } from 'viem';
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

// Helper function to check and update pending proposals
const checkAndUpdatePendingProposals = async (
  publicClient: ReturnType<typeof usePublicClient>,
): Promise<void> => {
  try {
    if (!publicClient) return;

    // Get all pending proposals with temp_ IDs
    const { data: pendingProposals, error } = await supabase
      .from('proposal_metadata')
      .select('*')
      .like('onchain_proposal_id', 'temp_%');

    if (error || !pendingProposals || pendingProposals.length === 0) {
      return; // No pending proposals to check
    }

    console.log(`🔍 Checking ${pendingProposals.length} pending proposal(s) for confirmation...`);

    // IMPORTANT: UserOperationHash ≠ Transaction Hash in ERC-4337
    // Query on-chain events directly instead of looking up by hash
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock - 1000n; // Look back ~1 hour on Base

    const proposalCreatedAbi = parseAbiItem(
      'event ProposalCreated(uint256 proposalId, address proposer, address[] targets, uint256[] values, string[] signatures, bytes[] calldatas, uint256 startBlock, uint256 endBlock, string description)',
    );

    let logs;
    try {
      logs = await publicClient.getLogs({
        address: CONTRACT_ADDRESSES.DAO_GOVERNOR as `0x${string}`,
        event: proposalCreatedAbi,
        fromBlock,
        toBlock: 'latest',
      });
    } catch (error: any) {
      // Handle rate limiting errors gracefully
      if (error?.status === 429 || error?.message?.includes('Too Many Requests') || error?.message?.includes('429')) {
        console.warn('⚠️ Rate limit hit when checking pending proposals. Skipping this check.');
        return; // Skip this check cycle
      }
      // Log but don't throw - this is a background check
      console.error('❌ Error fetching logs for pending proposals:', error);
      return;
    }

    // Parse all recent on-chain proposals
    const onChainProposals = logs.map((log) => {
      const parsed = parseEventLogs({
        abi: [proposalCreatedAbi],
        logs: [log],
      })[0];

      return {
        proposalId: parsed.args.proposalId?.toString(),
        proposer: (parsed.args.proposer as string)?.toLowerCase(),
        description: parsed.args.description as string,
        transactionHash: log.transactionHash,
      };
    });

    // Match pending proposals with on-chain events
    for (const proposal of pendingProposals) {
      // ✅ FIX: Include forum thread ID to match exact format used when creating proposal
      const expectedDescription = `# ${proposal.title}\n\n${proposal.description}${proposal.forum_thread_id ? `\n\nForum: ${proposal.forum_thread_id}` : ''}`;

      console.log(`🔍 Background check for pending proposal: ${proposal.title}`);
      console.log(`   Expected description length: ${expectedDescription.length}`);
      console.log(`   Includes forum ID: ${!!proposal.forum_thread_id}`);
      if (proposal.forum_thread_id) {
        console.log(`   Forum Thread ID: ${proposal.forum_thread_id}`);
      }

      const match = onChainProposals.find((onChain) => {
        const proposerMatch = onChain.proposer === proposal.proposer_address?.toLowerCase();
        const descriptionMatch = onChain.description === expectedDescription;

        if (proposerMatch) {
          console.log(`   ✅ Proposer match found for: ${onChain.description.substring(0, 50)}...`);
          console.log(`      On-chain description length: ${onChain.description.length}`);
          console.log(`      Description match: ${descriptionMatch ? '✅ YES' : '❌ NO'}`);
        }

        return proposerMatch && descriptionMatch;
      });

      if (match) {
        console.log(`   🎯 MATCH FOUND! Updating database...`);
        console.log(`      Temp ID: ${proposal.onchain_proposal_id}`);
        console.log(`      Real ID: ${match.proposalId}`);

        // Update the database with real proposal ID
        const { error: updateError } = await supabase
          .from('proposal_metadata')
          .update({
            onchain_proposal_id: match.proposalId,
            transaction_hash: match.transactionHash,
          })
          .eq('id', proposal.id);

        if (!updateError) {
          console.log(`   ✅ Database updated successfully: ${proposal.onchain_proposal_id} → ${match.proposalId}`);
        } else {
          console.error(`   ❌ Failed to update database:`, updateError);
        }
      } else {
        console.log(`   ❌ No match found for pending proposal: ${proposal.title}`);
      }
    }
  } catch (error) {
    console.error('❌ Error checking pending proposals:', error);
  }
};

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
  )! as AbiEvent;

  // 2) Fetch ProposalCreated logs
  // Note: Increased block range to capture all historical proposals
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock - 100000n; // Look back ~2.3 days on Base (2s block time)

  console.log(`🔍 Fetching proposals from block ${fromBlock} to ${currentBlock} (${100000n} blocks)`);

  let logs;
  try {
    logs = await publicClient.getLogs({
      address: GOVERNOR_ADDRESS,
      event: eventAbi,
      fromBlock,
      toBlock: 'latest',
    });
  } catch (error: any) {
    // Handle rate limiting errors gracefully
    if (error?.status === 429 || error?.message?.includes('Too Many Requests') || error?.message?.includes('429')) {
      console.warn('⚠️ Rate limit hit when fetching proposals. Using cached data if available.');
      // Return empty array to use cached data from React Query
      return [];
    }
    // Re-throw other errors
    throw error;
  }

  console.log(`📊 Found ${logs.length} ProposalCreated events`);
  const decoded = logs.map((log) =>
    decodeEventLog({
      abi: [eventAbi],
      data: log.data,
      topics: log.topics,
    }),
  );

  const proposals: Proposal[] = [];
  for (const ev of decoded) {
    try {
      // Keep ID as BigInt to preserve precision (these IDs are too large for JavaScript Number)
      const proposalId = (ev.args as any).proposalId as bigint;
      const description = (ev.args as any).description as string;

      // Log each proposal being processed
      const titlePreview = description.split('\n\n')[0].replace(/^#\s*/, '').substring(0, 50);
      console.log(`📝 Processing on-chain proposal: ${titlePreview}... (ID: ${proposalId.toString()})`);

      // 3) Read on‑chain proposal data using OpenZeppelin Governor functions
      // OpenZeppelin Governor doesn't have a single "proposals" function,
      // so we need to call individual functions
      const [startBlock, endBlock, votes] = await Promise.all([
        publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'proposalSnapshot',
          args: [proposalId],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'proposalDeadline',
          args: [proposalId],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: GOVERNOR_ADDRESS,
          abi: DAOGovernorABI,
          functionName: 'proposalVotes',
          args: [proposalId],
        }) as Promise<{
          againstVotes: bigint;
          forVotes: bigint;
          abstainVotes: bigint;
        }>,
      ]);

      const core = {
        startBlock,
        endBlock,
        forVotes: votes.forVotes,
        againstVotes: votes.againstVotes,
        abstainVotes: votes.abstainVotes,
      };

      // DEBUG: Log vote counts from blockchain
      console.log(`📊 [Proposal ${proposalId.toString().substring(0, 20)}...] Vote counts from chain:`, {
        for: votes.forVotes.toString(),
        against: votes.againstVotes.toString(),
        abstain: votes.abstainVotes.toString(),
      });

      // 4) Get proposal state with retry logic
      let state = -1; // Default to Unknown/Error state
      let stateError = false;

      try {
        state = await retryContractRead(
          () =>
            publicClient.readContract({
              address: GOVERNOR_ADDRESS,
              abi: DAOGovernorABI,
              functionName: 'state',
              args: [proposalId],
            }) as Promise<number>,
          {
            retries: 3,
            initialDelay: 500,
            onRetry: (error, attempt) => {
              console.warn(
                `[Proposal ${proposalId.toString()}] Retry ${attempt}/3 - Failed to fetch state:`,
                error.message,
              );
            },
          },
        );

        console.log(`[Proposal ${proposalId.toString()}] State fetched successfully: ${state}`);
      } catch (error) {
        console.error(
          `[Proposal ${proposalId.toString()}] Failed to fetch state after 3 retries:`,
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
      const body = parts.slice(1).join('\n\n'); // Capture ALL paragraphs after title

      // 6) Use on‑chain tallies for scores
      const choices = ['For', 'Against', 'Abstain'];
      const scores = [
        Number(core.forVotes),
        Number(core.againstVotes),
        Number(core.abstainVotes),
      ];

      proposals.push({
        id: proposalId.toString(),
        title,
        body,
        start: Number(core.startBlock),
        end: Number(core.endBlock),
        choices,
        scores,
        state, // Include the state (-1 if error, 0-7 if valid)
        stateError, // Flag if state fetch failed
      });

      console.log(`✅ Successfully processed proposal: ${title} (ID: ${proposalId.toString()})`);
    } catch (error) {
      // If this proposal fails to process, log the error and continue with the next one
      const proposalId = (ev.args as any).proposalId as bigint;
      const description = (ev.args as any).description as string;
      const titlePreview = description?.split('\n\n')[0]?.replace(/^#\s*/, '')?.substring(0, 50) || 'Unknown';
      console.error(`❌ Failed to process proposal: ${titlePreview}... (ID: ${proposalId?.toString()})`, error);
    }
  }

  return proposals;
};

export const useProposals = () => {
  const publicClient = usePublicClient();
  return useQuery<any[]>({
    queryKey: ['proposals', GOVERNOR_ADDRESS],
    queryFn: async () => {
      // First, check and update any pending proposals that may have been confirmed
      await checkAndUpdatePendingProposals(publicClient);

      console.log('🚀 Fetching on-chain proposals...');
      const onChainProposals = await fetchProposalsOnChain(publicClient);
      console.log(`🎯 fetchProposalsOnChain returned ${onChainProposals.length} proposals`);

      if (onChainProposals.length > 0) {
        console.log('📋 First proposal:', {
          id: onChainProposals[0].id,
          title: onChainProposals[0].title,
        });
      }

      // Get metadata for confirmed on-chain proposals
      console.log(`📥 Querying metadata for ${onChainProposals.length} on-chain proposals`);
      const { data: metadata, error: metadataError } = await supabase
        .from('proposal_metadata')
        .select('*')
        .in(
          'onchain_proposal_id',
          onChainProposals.map((p) => p.id),
        );

      if (metadataError) {
        console.error('❌ Error fetching proposal metadata:', metadataError);
      }

      console.log(`📊 Found ${metadata?.length || 0} metadata records in database`);
      if (metadata && metadata.length > 0) {
        console.log(`📋 Metadata IDs:`, metadata.map(m => m.onchain_proposal_id.substring(0, 20) + '...'));
      }

      // Only include on-chain proposals that have metadata in our database
      // This allows "deleting" proposals by removing their metadata
      const confirmedProposals = onChainProposals
        .filter((proposal) => {
          const hasMetadata = metadata?.some((m) => m.onchain_proposal_id === proposal.id);
          if (!hasMetadata) {
            console.log(`⚠️ Filtering out proposal: ${proposal.title} (ID: ${proposal.id.substring(0, 20)}...) - no metadata`);
          }
          return hasMetadata;
        })
        .map((proposal) => ({
          ...proposal,
          metadata:
            metadata?.find((m) => m.onchain_proposal_id === proposal.id) || null,
        }));

      console.log(`✅ After filtering: ${confirmedProposals.length} of ${onChainProposals.length} proposals have metadata`);

      // ALSO include pending proposals (temp_ IDs that haven't been confirmed on-chain)
      const { data: pendingMetadata, error: pendingError } = await supabase
        .from('proposal_metadata')
        .select('*')
        .like('onchain_proposal_id', 'temp_%')
        .order('created_at', { ascending: false });

      if (pendingError) {
        console.error('❌ Error fetching pending proposals:', pendingError);
      }

      console.log(`🔍 Found ${pendingMetadata?.length || 0} pending proposals (temp_* IDs)`);

      // Convert pending metadata to proposal format
      const pendingProposals = (pendingMetadata || []).map((meta) => {
        console.log(`📝 Pending proposal: ${meta.title} (${meta.onchain_proposal_id})`);
        return {
          id: meta.onchain_proposal_id,
          title: meta.title || 'Untitled Proposal',
          body: meta.description || '',
          start: 0, // Not yet on-chain
          end: 0,
          choices: ['For', 'Against', 'Abstain'],
          scores: [0, 0, 0], // No votes yet
          state: -1, // Pending state
          stateError: false,
          isPending: true, // Flag to indicate this is pending
          metadata: meta,
        };
      });

      console.log(`📊 Loaded proposals: ${confirmedProposals.length} confirmed, ${pendingProposals.length} pending`);

      // Return both confirmed and pending proposals
      const allProposals = [...confirmedProposals, ...pendingProposals];

      // Check if there are any pending proposals with temp_ IDs
      const hasPendingProposals = allProposals.some(p => p.id?.startsWith('temp_'));

      // Store this info for use in refetchInterval
      (allProposals as any).__hasPending = hasPendingProposals;

      console.log(`✅ useProposals queryFn returning ${allProposals.length} total proposals`);
      if (allProposals.length > 0) {
        console.log(`📋 Sample proposal IDs:`, allProposals.slice(0, 3).map(p => ({ id: p.id, title: p.title })));
      }

      return allProposals;
    },
    staleTime: 60_000,
    // Reduced refetch frequency to prevent session timeouts and recursive logs
    refetchInterval: (query) => {
      const data = query.state.data as any;
      const hasPending = data?.__hasPending || false;
      // If there are pending proposals, check every 30 seconds (reduced from 10s)
      // Otherwise, check every 5 minutes (reduced from 2min)
      return hasPending ? 30_000 : 5 * 60_000;
    },
  });
};

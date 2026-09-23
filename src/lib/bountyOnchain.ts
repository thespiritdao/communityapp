// src/lib/bountyOnchain.ts
// Server-side view of a bounty as BountyManager records it. Routes that act
// on bounty state with the service role (e.g. queueing $SELF on approval)
// must check the chain, because the bounties/bids rows are still writable
// by members through the API.

import { createPublicClient, http, type Abi } from 'viem';
import { base } from 'viem/chains';
import BountyManagerV5Artifact from '@/abis/BountyManagerV5.json';

const ZERO = '0x0000000000000000000000000000000000000000';

const abi = ((BountyManagerV5Artifact as { abi?: Abi }).abi ??
  BountyManagerV5Artifact) as Abi;

const makeClient = () =>
  createPublicClient({ chain: base, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });
let client: ReturnType<typeof makeClient> | undefined;
function publicClient() {
  client ??= makeClient();
  return client;
}

export type OnchainBounty = {
  creator: string;
  /** Assigned worker, or null when no bid has been assigned. */
  assignee: string | null;
  podId: string;
  value: bigint;
};

/** Reads creator, assignee and pod for an on-chain bounty id; null if absent. */
export async function readOnchainBounty(
  onchainId: string | number | bigint,
): Promise<OnchainBounty | null> {
  const address = process.env.NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS as `0x${string}` | undefined;
  if (!address) throw new Error('NEXT_PUBLIC_BOUNTY_MANAGER_ADDRESS is not set');
  const id = BigInt(onchainId);
  const pc = publicClient();

  const [bounty, assignment, metadata] = (await Promise.all([
    pc.readContract({ address, abi, functionName: 'getBounty', args: [id] }),
    pc.readContract({ address, abi, functionName: 'getAssignment', args: [id] }),
    pc.readContract({ address, abi, functionName: 'getBountyMetadata', args: [id] }),
  ])) as [readonly unknown[], readonly unknown[], readonly unknown[]];

  const creator = String(bounty[0]).toLowerCase();
  if (creator === ZERO) return null;
  const bidder = String(assignment[0]).toLowerCase();

  return {
    creator,
    assignee: bidder === ZERO ? null : bidder,
    podId: String(metadata[0]),
    value: BigInt(bounty[1] as bigint),
  };
}

/**
 * Governance Signature Utilities
 *
 * Generates EIP-712 signatures for gasless voting
 * Users sign in frontend, submit via CDP (gasless)
 */

import { encodePacked, keccak256, parseEther } from 'viem';

// EIP-712 Domain
export const GOVERNANCE_DOMAIN = {
  name: 'SpiritDAO Governance',
  version: '1',
  chainId: 8453, // Base mainnet
  verifyingContract: process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`,
};

// EIP-712 Types
export const VOTE_TYPES = {
  Vote: [
    { name: 'proposalId', type: 'bytes32' },
    { name: 'podId', type: 'bytes32' },
    { name: 'support', type: 'uint8' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/**
 * Convert UUID to bytes32 for Solidity
 */
export function uuidToBytes32(uuid: string): `0x${string}` {
  const hex = uuid.replace(/-/g, '');
  return `0x${hex.padEnd(64, '0')}` as `0x${string}`;
}

/**
 * Convert vote string to uint8
 */
export function voteToUint8(vote: string): number {
  switch (vote.toLowerCase()) {
    case 'against': return 0;
    case 'for': return 1;
    case 'abstain': return 2;
    default: throw new Error(`Invalid vote: ${vote}`);
  }
}

/**
 * Sign a governance vote (EIP-712)
 *
 * @param walletClient - Viem wallet client
 * @param proposalId - Proposal UUID
 * @param podId - Pod UUID
 * @param support - Vote choice ('for' | 'against' | 'abstain')
 * @param nonce - Current nonce for voter (from contract)
 * @returns Signature components { v, r, s, deadline }
 */
export async function signVote(
  walletClient: any,
  proposalId: string,
  podId: string,
  support: 'for' | 'against' | 'abstain',
  nonce: bigint
) {
  const account = walletClient.account;
  if (!account) throw new Error('No wallet connected');

  // Deadline: 1 hour from now
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const message = {
    proposalId: uuidToBytes32(proposalId),
    podId: uuidToBytes32(podId),
    support: voteToUint8(support),
    nonce,
    deadline,
  };

  console.log('🔐 Signing vote:', {
    proposalId,
    podId,
    support,
    nonce: nonce.toString(),
    deadline: deadline.toString(),
  });

  // Sign with EIP-712
  const signature = await walletClient.signTypedData({
    account,
    domain: GOVERNANCE_DOMAIN,
    types: VOTE_TYPES,
    primaryType: 'Vote',
    message,
  });

  // Split signature into v, r, s
  const r = signature.slice(0, 66) as `0x${string}`;
  const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
  const v = parseInt(signature.slice(130, 132), 16);

  return {
    v,
    r,
    s,
    deadline,
    signature,
  };
}

/**
 * Submit vote to PodGovernance contract (GASLESS via CDP)
 *
 * @param publicClient - Viem public client
 * @param walletClient - Viem wallet client
 * @param proposalId - Proposal UUID
 * @param podId - Pod UUID
 * @param support - Vote choice
 * @param signature - EIP-712 signature components
 */
export async function submitVoteOnchain(
  publicClient: any,
  walletClient: any,
  proposalId: string,
  podId: string,
  support: 'for' | 'against' | 'abstain',
  signature: { v: number; r: `0x${string}`; s: `0x${string}`; deadline: bigint }
) {
  const contractAddress = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;

  if (!contractAddress) {
    throw new Error('POD_GOVERNANCE_ADDRESS not configured');
  }

  console.log('📝 Submitting vote on-chain...');
  console.log('   Contract:', contractAddress);
  console.log('   Proposal:', proposalId);
  console.log('   Pod:', podId);
  console.log('   Support:', support);

  // Get nonce (required for recordVote call)
  const nonce = await getVoterNonce(publicClient, walletClient.account.address as `0x${string}`);

  // Call recordVote (gasless via CDP)
  const { request } = await publicClient.simulateContract({
    address: contractAddress,
    abi: POD_GOVERNANCE_ABI,
    functionName: 'recordVote',
    args: [
      uuidToBytes32(proposalId),
      uuidToBytes32(podId),
      voteToUint8(support),
      nonce,
      signature.deadline,
      signature.v,
      signature.r,
      signature.s,
    ],
    account: walletClient.account,
  });

  const hash = await walletClient.writeContract(request);

  console.log('⏳ Transaction sent:', hash);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  console.log('✅ Vote recorded on-chain!');
  console.log('   Block:', receipt.blockNumber);
  console.log('   Gas used:', receipt.gasUsed.toString());

  return receipt;
}

// Minimal ABI for recordVote
const POD_GOVERNANCE_ABI = [
  {
    name: 'recordVote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'podId', type: 'bytes32' },
      { name: 'support', type: 'uint8' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'getNonce',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'voter', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'hasVotedOnProposal',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'proposalId', type: 'bytes32' },
      { name: 'voter', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

/**
 * Get voter's current nonce
 */
export async function getVoterNonce(
  publicClient: any,
  voterAddress: `0x${string}`
): Promise<bigint> {
  const contractAddress = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;

  const nonce = await publicClient.readContract({
    address: contractAddress,
    abi: POD_GOVERNANCE_ABI,
    functionName: 'getNonce',
    args: [voterAddress],
  });

  return nonce as bigint;
}

/**
 * Check if voter has already voted on proposal
 */
export async function hasVotedOnProposal(
  publicClient: any,
  proposalId: string,
  voterAddress: `0x${string}`
): Promise<boolean> {
  const contractAddress = process.env.NEXT_PUBLIC_POD_GOVERNANCE_ADDRESS as `0x${string}`;

  const voted = await publicClient.readContract({
    address: contractAddress,
    abi: POD_GOVERNANCE_ABI,
    functionName: 'hasVotedOnProposal',
    args: [uuidToBytes32(proposalId), voterAddress],
  });

  return voted as boolean;
}

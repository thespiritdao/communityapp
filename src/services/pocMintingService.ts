/**
 * Proof of Curiosity Minting Service
 *
 * Handles minting of PoC NFTs for new users during onboarding
 * Uses Coinbase OnchainKit Transaction component with sponsored transactions
 */

import { encodeFunctionData } from 'viem';
import ProofOfCuriosityABI from '@/abis/ProofOfCuriosityABI.json';
import { CONTRACT_ADDRESSES } from '@/config/contracts';

// ============================================================
// Constants
// ============================================================

const POC_CONTRACT_ADDRESS = CONTRACT_ADDRESSES.PROOF_OF_CURIOSITY;

// Default metadata URI for beta testers
const DEFAULT_POC_URI = 'ipfs://QmProofOfCuriosityBetaTester'; // TODO: Replace with actual URI

// ============================================================
// Types
// ============================================================

export interface MintPoCCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

// ============================================================
// Contract Calls
// ============================================================

/**
 * Create call data for minting Proof of Curiosity NFT
 * Used with Transaction component
 *
 * @param recipientAddress - Address to receive the PoC NFT
 * @param metadataURI - Optional custom metadata URI (defaults to beta tester URI)
 * @returns Transaction call object
 */
export function createMintPoCCall(
  recipientAddress: `0x${string}`,
  metadataURI?: string
): MintPoCCall {
  const uri = metadataURI || DEFAULT_POC_URI;

  const data = encodeFunctionData({
    abi: ProofOfCuriosityABI,
    functionName: 'mintProofOfCuriosity',
    args: [recipientAddress, uri],
  });

  return {
    to: POC_CONTRACT_ADDRESS,
    data,
    value: BigInt(0), // No ETH required
  };
}

/**
 * Create call data for batch minting Proof of Curiosity NFTs
 *
 * @param recipients - Array of addresses to receive PoC NFTs
 * @returns Transaction call object
 */
export function createBatchMintPoCCall(
  recipients: `0x${string}`[]
): MintPoCCall {
  const data = encodeFunctionData({
    abi: ProofOfCuriosityABI,
    functionName: 'batchMintProofOfCuriosity',
    args: [recipients],
  });

  return {
    to: POC_CONTRACT_ADDRESS,
    data,
    value: BigInt(0),
  };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if address already has Proof of Curiosity
 * Uses public RPC call (no wallet needed)
 *
 * @param address - Address to check
 * @param publicClient - Viem public client
 * @returns Boolean indicating if address has PoC
 */
export async function hasProofOfCuriosity(
  address: `0x${string}`,
  publicClient: any
): Promise<boolean> {
  try {
    const result = await publicClient.readContract({
      address: POC_CONTRACT_ADDRESS,
      abi: ProofOfCuriosityABI,
      functionName: 'hasProofOfCuriosity',
      args: [address],
    });

    return result as boolean;
  } catch (error) {
    console.error('Error checking PoC status:', error);
    return false;
  }
}

/**
 * Get PoC balance for address
 *
 * @param address - Address to check
 * @param publicClient - Viem public client
 * @returns Number of PoC NFTs owned
 */
export async function getPoCBalance(
  address: `0x${string}`,
  publicClient: any
): Promise<number> {
  try {
    const result = await publicClient.readContract({
      address: POC_CONTRACT_ADDRESS,
      abi: ProofOfCuriosityABI,
      functionName: 'balanceOf',
      args: [address],
    });

    return Number(result);
  } catch (error) {
    console.error('Error getting PoC balance:', error);
    return 0;
  }
}

/**
 * Get total PoC NFTs minted
 *
 * @param publicClient - Viem public client
 * @returns Total minted count
 */
export async function getTotalPoCMinted(publicClient: any): Promise<number> {
  try {
    const result = await publicClient.readContract({
      address: POC_CONTRACT_ADDRESS,
      abi: ProofOfCuriosityABI,
      functionName: 'totalMinted',
    });

    return Number(result);
  } catch (error) {
    console.error('Error getting total PoC minted:', error);
    return 0;
  }
}

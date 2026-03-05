/**
 * Executive Hat Assignment Service
 *
 * Handles assignment of Executive Pod Leader hat.
 */

import { encodeFunctionData } from 'viem';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import { getHatIdBigInt, getHatId } from '@/lib/hatRegistry';

// ============================================================
// Constants
// ============================================================

const HATS_PROTOCOL_ADDRESS = CONTRACT_ADDRESSES.HATS_PROTOCOL;

// Minimal Hats ABI for mintHat function
const HATS_MINT_ABI = [
  {
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_wearer', type: 'address' },
    ],
    name: 'mintHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: '_user', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    name: 'isWearerOfHat',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: '_wearer', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============================================================
// Types
// ============================================================

export interface MintHatCall {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
}

// ============================================================
// Contract Calls
// ============================================================

/**
 * Create call data for minting Executive Pod Leader hat
 *
 * @param recipientAddress - Address to receive the leader hat
 * @returns Transaction call object
 */
export async function createMintExecutiveLeaderHatCall(
  recipientAddress: `0x${string}`,
): Promise<MintHatCall> {
  const hatId = await getHatIdBigInt('EXECUTIVE_POD_LEADER');

  console.log('👑 Creating Executive Leader hat mint for:', recipientAddress);
  console.log('   Hat ID:', hatId.toString(16));
  console.log('   Hats Protocol:', HATS_PROTOCOL_ADDRESS);

  const data = encodeFunctionData({
    abi: HATS_MINT_ABI,
    functionName: 'mintHat',
    args: [hatId, recipientAddress],
  });

  return {
    to: HATS_PROTOCOL_ADDRESS,
    data,
    value: BigInt(0),
  };
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Check if address is wearing Executive Leader hat
 *
 * @param address - Address to check
 * @param publicClient - Viem public client
 * @returns Boolean indicating if address wears leader hat
 */
export async function isExecutiveLeader(
  address: `0x${string}`,
  publicClient: any,
): Promise<boolean> {
  const hatId = await getHatId('EXECUTIVE_POD_LEADER');
  if (!hatId) return false;

  try {
    const result = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_MINT_ABI,
      functionName: 'isWearerOfHat',
      args: [address, BigInt(hatId)],
    });

    return result as boolean;
  } catch (error) {
    console.error('Error checking Executive Leader status:', error);
    return false;
  }
}

/**
 * Get Executive Leader hat balance for address
 * Should be 0 or 1 (single hat per user)
 *
 * @param address - Address to check
 * @param publicClient - Viem public client
 * @returns Hat balance (0 or 1)
 */
export async function getExecutiveLeaderHatBalance(
  address: `0x${string}`,
  publicClient: any,
): Promise<number> {
  const hatId = await getHatId('EXECUTIVE_POD_LEADER');
  if (!hatId) return 0;

  try {
    const result = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_MINT_ABI,
      functionName: 'balanceOf',
      args: [address, BigInt(hatId)],
    });

    return Number(result);
  } catch (error) {
    console.error('Error getting Executive Leader hat balance:', error);
    return 0;
  }
}

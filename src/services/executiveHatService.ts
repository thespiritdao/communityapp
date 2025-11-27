/**
 * Executive Hat Assignment Service
 *
 * Handles assignment of Executive Pod Leader and Member hats
 * Used for first user and beta testers
 */

import { encodeFunctionData } from 'viem';
import { CONTRACT_ADDRESSES, HAT_IDS } from '@/config/contracts';

// ============================================================
// Constants
// ============================================================

const HATS_PROTOCOL_ADDRESS = CONTRACT_ADDRESSES.HATS_PROTOCOL;
const EXECUTIVE_LEADER_HAT_ID = HAT_IDS.EXECUTIVE_POD_LEADER;
const EXECUTIVE_MEMBER_HAT_ID = HAT_IDS.EXECUTIVE_POD_MEMBER;
const BETA_TESTER_HAT_ID = HAT_IDS.BETA_TESTER_HAT;

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
export function createMintExecutiveLeaderHatCall(
  recipientAddress: `0x${string}`,
): MintHatCall {
  if (!EXECUTIVE_LEADER_HAT_ID) {
    throw new Error(
      'EXECUTIVE_POD_LEADER hat ID not configured. ' +
        'Please set NEXT_PUBLIC_EXECUTIVE_POD_LEADER in your environment variables.',
    );
  }

  console.log('👑 Creating Executive Leader hat mint for:', recipientAddress);
  console.log('   Hat ID:', EXECUTIVE_LEADER_HAT_ID);
  console.log('   Hats Protocol:', HATS_PROTOCOL_ADDRESS);

  const data = encodeFunctionData({
    abi: HATS_MINT_ABI,
    functionName: 'mintHat',
    args: [BigInt(EXECUTIVE_LEADER_HAT_ID), recipientAddress],
  });

  return {
    to: HATS_PROTOCOL_ADDRESS,
    data,
    value: BigInt(0),
  };
}

/**
 * Create call data for minting Executive Pod Member hat
 *
 * @param recipientAddress - Address to receive the member hat
 * @returns Transaction call object
 */
export function createMintExecutiveMemberHatCall(
  recipientAddress: `0x${string}`,
): MintHatCall {
  if (!EXECUTIVE_MEMBER_HAT_ID) {
    throw new Error('EXECUTIVE_POD_MEMBER hat ID not configured');
  }

  const data = encodeFunctionData({
    abi: HATS_MINT_ABI,
    functionName: 'mintHat',
    args: [BigInt(EXECUTIVE_MEMBER_HAT_ID), recipientAddress],
  });

  return {
    to: HATS_PROTOCOL_ADDRESS,
    data,
    value: BigInt(0),
  };
}

/**
 * Create call data for minting Beta Tester hat (temporary 30-day testing)
 *
 * @param recipientAddress - Address to receive the beta tester hat
 * @returns Transaction call object
 */
export function createMintBetaTesterHatCall(
  recipientAddress: `0x${string}`,
): MintHatCall {
  if (!BETA_TESTER_HAT_ID) {
    throw new Error(
      'BETA_TESTER_HAT hat ID not configured. ' +
        'Please set NEXT_PUBLIC_BETA_TESTER_HAT in your environment variables.',
    );
  }

  // Validate hat ID format (should be 32-byte hex string)
  if (
    BETA_TESTER_HAT_ID ===
    '0x0000000000000000000000000000000000000000000000000000000000000000'
  ) {
    throw new Error(
      'BETA_TESTER_HAT is set to zero address. ' +
        'Please create the Beta Tester hat in Hats Protocol and set the correct hat ID.',
    );
  }

  console.log('🗝️ Creating Beta Tester hat mint for:', recipientAddress);
  console.log('   Hat ID:', BETA_TESTER_HAT_ID);
  console.log('   Hats Protocol:', HATS_PROTOCOL_ADDRESS);

  const data = encodeFunctionData({
    abi: HATS_MINT_ABI,
    functionName: 'mintHat',
    args: [BigInt(BETA_TESTER_HAT_ID), recipientAddress],
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
  if (!EXECUTIVE_LEADER_HAT_ID) return false;

  try {
    const result = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_MINT_ABI,
      functionName: 'isWearerOfHat',
      args: [address, BigInt(EXECUTIVE_LEADER_HAT_ID)],
    });

    return result as boolean;
  } catch (error) {
    console.error('Error checking Executive Leader status:', error);
    return false;
  }
}

/**
 * Check if address is wearing Executive Member hat
 *
 * @param address - Address to check
 * @param publicClient - Viem public client
 * @returns Boolean indicating if address wears member hat
 */
export async function isExecutiveMember(
  address: `0x${string}`,
  publicClient: any,
): Promise<boolean> {
  if (!EXECUTIVE_MEMBER_HAT_ID) return false;

  try {
    const result = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_MINT_ABI,
      functionName: 'isWearerOfHat',
      args: [address, BigInt(EXECUTIVE_MEMBER_HAT_ID)],
    });

    return result as boolean;
  } catch (error) {
    console.error('Error checking Executive Member status:', error);
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
  if (!EXECUTIVE_LEADER_HAT_ID) return 0;

  try {
    const result = await publicClient.readContract({
      address: HATS_PROTOCOL_ADDRESS,
      abi: HATS_MINT_ABI,
      functionName: 'balanceOf',
      args: [address, BigInt(EXECUTIVE_LEADER_HAT_ID)],
    });

    return Number(result);
  } catch (error) {
    console.error('Error getting Executive Leader hat balance:', error);
    return 0;
  }
}

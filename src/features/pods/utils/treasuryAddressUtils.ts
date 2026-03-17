import { getContract } from 'viem';
import { publicClient } from '@/config/wagmi.client';

// Treasury Factory Contract Address (from environment variable)
const TREASURY_FACTORY_ADDRESS = process.env
  .NEXT_PUBLIC_POD_TREASURY_FACTORY as `0x${string}`;

// Factory ABI for getTreasuryForPod
const FACTORY_ABI = [
  {
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
] as const;

/**
 * Get treasury address for a pod - Factory first, database fallback
 *
 * @param podId - The pod ID to lookup
 * @param fallbackAddress - Database treasury address as fallback
 * @returns Promise<string> - The treasury address to use
 */
export async function getTreasuryAddress(
  podId: string,
  fallbackAddress?: string | null,
): Promise<string> {
  // Database address takes priority — it is explicitly set and may differ from
  // the factory registry (e.g. after a treasury redeployment).
  if (
    fallbackAddress &&
    fallbackAddress !== '0x0000000000000000000000000000000000000000'
  ) {
    console.log('🏦 Using database treasury address:', fallbackAddress);
    return fallbackAddress;
  }

  try {
    console.log('🏦 No DB address, querying factory for pod:', podId);

    const factoryContract = getContract({
      address: TREASURY_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      client: publicClient,
    });

    const factoryAddress = await factoryContract.read.getTreasuryForPod([
      podId,
    ]);
    console.log('🏦 Factory returned treasury address:', factoryAddress);

    if (
      factoryAddress &&
      factoryAddress !== '0x0000000000000000000000000000000000000000'
    ) {
      return factoryAddress;
    }

    throw new Error(
      `No treasury found for pod ${podId} in factory or database`,
    );
  } catch (error) {
    console.error('🏦 Error getting treasury address from factory:', error);
    throw error;
  }
}

/**
 * Check if a pod has a deployed treasury (factory or database)
 *
 * @param podId - The pod ID to check
 * @param fallbackAddress - Database treasury address
 * @returns Promise<boolean> - Whether treasury exists
 */
export async function hasTreasuryDeployed(
  podId: string,
  fallbackAddress?: string | null,
): Promise<boolean> {
  try {
    const treasuryAddress = await getTreasuryAddress(podId, fallbackAddress);
    return !!treasuryAddress;
  } catch (error) {
    console.error('🏦 Error checking treasury deployment:', error);
    return false;
  }
}

/**
 * Get treasury address synchronously from database only (for immediate UI updates)
 * Use this when you need immediate feedback, but follow up with getTreasuryAddress
 *
 * @param fallbackAddress - Database treasury address
 * @returns string | null - The fallback address or null
 */
export function getTreasuryAddressSync(
  fallbackAddress?: string | null,
): string | null {
  if (
    fallbackAddress &&
    fallbackAddress !== '0x0000000000000000000000000000000000000000'
  ) {
    return fallbackAddress;
  }
  return null;
}

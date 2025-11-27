import { getContract } from 'viem';
import { publicClient } from '@/config/wagmi.client';

// Treasury Factory Contract Address (from environment variable)
const TREASURY_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_POD_TREASURY_FACTORY as `0x${string}`;

// Factory ABI for getTreasuryForPod
const FACTORY_ABI = [
  {
    name: 'getTreasuryForPod',
    type: 'function',
    inputs: [{ name: 'podId', type: 'string' }],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view'
  }
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
  fallbackAddress?: string | null
): Promise<string> {
  try {
    console.log('🏦 Looking up treasury for pod:', podId);
    
    // First, try to get from factory contract (authoritative source)
    const factoryContract = getContract({
      address: TREASURY_FACTORY_ADDRESS,
      abi: FACTORY_ABI,
      client: publicClient,
    });
    
    const factoryAddress = await factoryContract.read.getTreasuryForPod([podId]);
    console.log('🏦 Factory returned treasury address:', factoryAddress);
    
    // Check if factory has a valid address (not zero address)
    if (factoryAddress && factoryAddress !== '0x0000000000000000000000000000000000000000') {
      console.log('🏦 Using factory treasury address:', factoryAddress);
      return factoryAddress;
    }
    
    // Fallback to database address if factory doesn't have one
    if (fallbackAddress && fallbackAddress !== '0x0000000000000000000000000000000000000000') {
      console.log('🏦 Using database fallback treasury address:', fallbackAddress);
      return fallbackAddress;
    }
    
    throw new Error(`No treasury found for pod ${podId} in factory or database`);
    
  } catch (error) {
    console.error('🏦 Error getting treasury address from factory:', error);
    
    // If factory lookup fails, use database fallback
    if (fallbackAddress && fallbackAddress !== '0x0000000000000000000000000000000000000000') {
      console.log('🏦 Factory lookup failed, using database fallback:', fallbackAddress);
      return fallbackAddress;
    }
    
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
  fallbackAddress?: string | null
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
export function getTreasuryAddressSync(fallbackAddress?: string | null): string | null {
  if (fallbackAddress && fallbackAddress !== '0x0000000000000000000000000000000000000000') {
    return fallbackAddress;
  }
  return null;
}
/**
 * Service for syncing pod data using the Factory pattern
 * Enables scalable authorization without manual whitelist management
 */

import { PodCoreService } from './PodCoreService';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Import the new factory ABI (to be created)
// import PodAuthorizationFactoryABI from '@/abis/PodAuthorizationFactory.json';

// Deployed factory contract address
const POD_AUTHORIZATION_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`);

// Temporary ABI definition until we compile and generate the JSON
const PodAuthorizationFactoryABI = [
  {
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'creator', type: 'address' },
      { name: 'leaders', type: 'address[]' },
      { name: 'treasuryAddress', type: 'address' },
    ],
    name: 'createPodProxy',
    outputs: [{ name: 'proxy', type: 'address' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'podId', type: 'string' },
      { name: 'newLeaders', type: 'address[]' },
      { name: 'newTreasuryAddress', type: 'address' },
      { name: 'isActive', type: 'bool' },
    ],
    name: 'updatePodProxy',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    name: 'canManageBounties',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'podId', type: 'string' },
    ],
    name: 'canUsePodTreasury',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'podId', type: 'string' }],
    name: 'isValidPod',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'getAllPods',
    outputs: [{ name: '', type: 'string[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'podId', type: 'string' }],
    name: 'getPodProxy',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export class PodFactorySyncService {
  private static publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  /**
   * Check if pod exists in factory
   */
  static async isPodRegistered(podId: string): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: POD_AUTHORIZATION_FACTORY_ADDRESS,
        abi: PodAuthorizationFactoryABI,
        functionName: 'isValidPod',
        args: [podId],
      });
      return result as boolean;
    } catch (error) {
      console.error('Error checking pod registration:', error);
      return false;
    }
  }

  /**
   * Get all registered pod IDs from factory
   */
  static async getRegisteredPods(): Promise<string[]> {
    try {
      const result = await this.publicClient.readContract({
        address: POD_AUTHORIZATION_FACTORY_ADDRESS,
        abi: PodAuthorizationFactoryABI,
        functionName: 'getAllPods',
      });
      return result as string[];
    } catch (error) {
      console.error('Error getting registered pods:', error);
      return [];
    }
  }

  /**
   * Generate transaction call to create a new pod proxy
   */
  static generateCreatePodCall(pod: any) {
    console.log('🔄 Generating createPodProxy transaction call for:', pod.name);

    // Extract leaders from pod data
    const leaders: `0x${string}`[] = [];

    // Add creator as leader
    if (pod.created_by_address) {
      leaders.push(pod.created_by_address as `0x${string}`);
    }

    // Add pod leads (excluding duplicates)
    if (pod.pod_leads && Array.isArray(pod.pod_leads)) {
      pod.pod_leads.forEach((leader: string) => {
        if (leader && !leaders.includes(leader as `0x${string}`)) {
          leaders.push(leader as `0x${string}`);
        }
      });
    }

    // Use treasury address or zero address as fallback
    const treasuryAddress =
      pod.treasury_contract_address ||
      '0x0000000000000000000000000000000000000000';

    return {
      to: POD_AUTHORIZATION_FACTORY_ADDRESS,
      abi: PodAuthorizationFactoryABI,
      functionName: 'createPodProxy' as const,
      args: [
        pod.id, // podId
        pod.created_by_address as `0x${string}`, // creator
        leaders, // leaders array
        treasuryAddress as `0x${string}`, // treasuryAddress
      ],
    };
  }

  /**
   * Generate transaction call to update pod proxy data
   */
  static generateUpdatePodCall(pod: any) {
    console.log('🔄 Generating updatePodProxy transaction call for:', pod.name);

    // Extract leaders from pod data
    const leaders: `0x${string}`[] = [];

    // Add creator as leader
    if (pod.created_by_address) {
      leaders.push(pod.created_by_address as `0x${string}`);
    }

    // Add pod leads (excluding duplicates)
    if (pod.pod_leads && Array.isArray(pod.pod_leads)) {
      pod.pod_leads.forEach((leader: string) => {
        if (leader && !leaders.includes(leader as `0x${string}`)) {
          leaders.push(leader as `0x${string}`);
        }
      });
    }

    // Use treasury address or zero address as fallback
    const treasuryAddress =
      pod.treasury_contract_address ||
      '0x0000000000000000000000000000000000000000';
    const isActive = pod.status === 'active';

    return {
      to: POD_AUTHORIZATION_FACTORY_ADDRESS,
      abi: PodAuthorizationFactoryABI,
      functionName: 'updatePodProxy' as const,
      args: [
        pod.id, // podId
        leaders, // newLeaders
        treasuryAddress as `0x${string}`, // newTreasuryAddress
        isActive, // isActive
      ],
    };
  }

  /**
   * Get pods that need to be synced to factory
   */
  static async getPodsNeedingSync(): Promise<{
    toRegister: any[];
    toUpdate: any[];
  }> {
    try {
      console.log('🔄 Checking which pods need factory sync...');

      // Get all active pods from database
      const pods = await PodCoreService.getAllPods();
      const registeredPodIds = await this.getRegisteredPods();

      console.log(`📊 Found ${pods.length} active pods in database`);
      console.log(
        `📊 Found ${registeredPodIds.length} registered pods in factory`,
      );

      const toRegister: any[] = [];
      const toUpdate: any[] = [];

      for (const pod of pods) {
        const isRegistered = registeredPodIds.includes(pod.id);

        if (!isRegistered) {
          toRegister.push(pod);
          console.log(`📝 Pod "${pod.name}" needs to be registered`);
        } else {
          toUpdate.push(pod);
          console.log(`🔄 Pod "${pod.name}" needs to be updated`);
        }
      }

      return { toRegister, toUpdate };
    } catch (error) {
      console.error('Error checking pods needing sync:', error);
      return { toRegister: [], toUpdate: [] };
    }
  }

  /**
   * Check if user can manage bounties for a pod (from factory)
   */
  static async canManageBounties(
    userAddress: string,
    podId: string,
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: POD_AUTHORIZATION_FACTORY_ADDRESS,
        abi: PodAuthorizationFactoryABI,
        functionName: 'canManageBounties',
        args: [userAddress as `0x${string}`, podId],
      });
      return result as boolean;
    } catch (error) {
      console.error('Error checking bounty management permission:', error);
      return false;
    }
  }

  /**
   * Check if user can use pod treasury (from factory)
   */
  static async canUsePodTreasury(
    userAddress: string,
    podId: string,
  ): Promise<boolean> {
    try {
      const result = await this.publicClient.readContract({
        address: POD_AUTHORIZATION_FACTORY_ADDRESS,
        abi: PodAuthorizationFactoryABI,
        functionName: 'canUsePodTreasury',
        args: [userAddress as `0x${string}`, podId],
      });
      return result as boolean;
    } catch (error) {
      console.error('Error checking treasury permission:', error);
      return false;
    }
  }

  /**
   * Get pod proxy address
   */
  static async getPodProxy(podId: string): Promise<string> {
    try {
      const result = await this.publicClient.readContract({
        address: POD_AUTHORIZATION_FACTORY_ADDRESS,
        abi: PodAuthorizationFactoryABI,
        functionName: 'getPodProxy',
        args: [podId],
      });
      return result as string;
    } catch (error) {
      console.error('Error getting pod proxy:', error);
      return '0x0000000000000000000000000000000000000000';
    }
  }
}

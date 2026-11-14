/**
 * Service for syncing pod data to blockchain contracts
 * Uses PodAuthorizationFactory for permission validation
 * UPDATED: Now uses factory pattern instead of PodBountyService for better authorization
 */

import { PodCoreService } from './PodCoreService';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { base } from 'viem/chains';
import PodAuthorizationFactoryABI from '@/abis/PodAuthorizationFactory.json';

// Use PodAuthorizationFactory instead of PodBountyService
const POD_AUTHORIZATION_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_POD_AUTH_FACTORY as `0x${string}`);

export class PodBlockchainSyncService {
  private static publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  /**
   * Check if pod exists in factory contract
   * UPDATED: Now uses PodAuthorizationFactory.isValidPod()
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
   * UPDATED: Now uses PodAuthorizationFactory.getAllPods()
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
   * Generate transaction call to register a pod via factory
   * UPDATED v2: Now includes predicted admin hat ID for gasless Phase 6 elimination
   */
  static generateRegisterPodCall(pod: any, predictedAdminHatId?: string) {
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

    // Convert predicted admin hat ID to BigInt (required for v2 contracts)
    const predictedAdminHatIdBigInt = predictedAdminHatId
      ? BigInt(predictedAdminHatId)
      : BigInt(0);

    console.log('🔮 Predicted admin HAT ID for proxy initialization:', {
      raw: predictedAdminHatId,
      bigInt: predictedAdminHatIdBigInt.toString(),
      hex: '0x' + predictedAdminHatIdBigInt.toString(16).padStart(64, '0'),
    });

    return {
      to: POD_AUTHORIZATION_FACTORY_ADDRESS,
      abi: PodAuthorizationFactoryABI,
      functionName: 'createPodProxy' as const,
      args: [
        pod.id, // podId
        pod.created_by_address as `0x${string}`, // creator
        leaders, // leaders array
        treasuryAddress as `0x${string}`, // treasuryAddress
        predictedAdminHatIdBigInt, // predictedProxyAdminHatId (NEW in v2)
      ],
    };
  }

  /**
   * Generate transaction call to update pod data via factory
   * UPDATED: Now uses PodAuthorizationFactory.updatePodProxy()
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
   * Get pods that need to be synced to blockchain
   */
  static async getPodsNeedingSync(): Promise<{
    toRegister: any[];
    toUpdate: any[];
  }> {
    try {
      console.log('🔄 Checking which pods need blockchain sync...');

      // Get all active pods from database
      const pods = await PodCoreService.getAllPods();
      const registeredPodIds = await this.getRegisteredPods();

      console.log(`📊 Found ${pods.length} active pods in database`);
      console.log(
        `📊 Found ${registeredPodIds.length} registered pods on blockchain`,
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
   * Check if user can manage bounties for a pod via factory
   * UPDATED: Now uses PodAuthorizationFactory.canManageBounties()
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
   * Check if user can use pod treasury via factory
   * UPDATED: Now uses PodAuthorizationFactory.canUsePodTreasury()
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
   * Get pod proxy address from factory
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

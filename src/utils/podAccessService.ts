import { EventService } from '../features/events/lib/supabase';
import type { PublicClient } from 'viem';

/**
 * Service for handling pod-based access control using HATS Protocol
 * Replaces token-based pod access with HAT-based access
 */
export class PodAccessService {
  
  /**
   * Check if a user has access to a specific pod via HAT ownership
   */
  static async checkPodAccess(
    publicClient: PublicClient,
    userAddress: string,
    podId: string
  ): Promise<{
    hasManagementAccess: boolean;
    hasMembershipAccess: boolean;
    pod: any | null;
  }> {
    try {
      // Get pod details from database
      const pod = await EventService.getPodById(podId);
      if (!pod) {
        return {
          hasManagementAccess: false,
          hasMembershipAccess: false,
          pod: null
        };
      }

      const HATS_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
      const HATS_ABI = [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [
            { name: 'account', type: 'address' },
            { name: 'id', type: 'uint256' }
          ],
          outputs: [{ name: '', type: 'uint256' }],
          stateMutability: 'view'
        }
      ] as const;

      // Check management HAT access
      let hasManagementAccess = false;
      if (pod.management_hat_id) {
        try {
          const managementBalance = await publicClient.readContract({
            address: HATS_CONTRACT_ADDRESS,
            abi: HATS_ABI,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`, BigInt(pod.management_hat_id)]
          });
          hasManagementAccess = Number(managementBalance) > 0;
        } catch (error) {
          console.warn('Failed to check management HAT:', error);
        }
      }

      // Check membership HAT access
      let hasMembershipAccess = false;
      if (pod.membership_hat_id) {
        try {
          const membershipBalance = await publicClient.readContract({
            address: HATS_CONTRACT_ADDRESS,
            abi: HATS_ABI,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`, BigInt(pod.membership_hat_id)]
          });
          hasMembershipAccess = Number(membershipBalance) > 0;
        } catch (error) {
          console.warn('Failed to check membership HAT:', error);
        }
      }

      return {
        hasManagementAccess,
        hasMembershipAccess,
        pod
      };

    } catch (error) {
      console.error('Failed to check pod access:', error);
      return {
        hasManagementAccess: false,
        hasMembershipAccess: false,
        pod: null
      };
    }
  }

  /**
   * Get all pods that a user has access to
   */
  static async getUserPodAccess(
    publicClient: PublicClient,
    userAddress: string
  ): Promise<{
    managedPods: any[];
    memberPods: any[];
  }> {
    try {
      // Get all active pods
      const allPods = await EventService.getAllPods();
      
      const managedPods: any[] = [];
      const memberPods: any[] = [];

      // Check access for each pod
      await Promise.all(
        allPods.map(async (pod) => {
          const access = await this.checkPodAccess(publicClient, userAddress, pod.id);
          
          if (access.hasManagementAccess) {
            managedPods.push(pod);
          } else if (access.hasMembershipAccess) {
            memberPods.push(pod);
          }
        })
      );

      return { managedPods, memberPods };

    } catch (error) {
      console.error('Failed to get user pod access:', error);
      return { managedPods: [], memberPods: [] };
    }
  }

  /**
   * Get available pods for event organization (user has management access)
   */
  static async getAvailablePodsForEvents(
    publicClient: PublicClient,
    userAddress: string
  ): Promise<Array<{
    id: string;
    name: string;
    description: string;
    treasury_contract_address?: string;
    canOrganize: boolean;
  }>> {
    try {
      const { managedPods } = await this.getUserPodAccess(publicClient, userAddress);
      
      return managedPods.map(pod => ({
        id: pod.id,
        name: pod.name,
        description: pod.description || '',
        treasury_contract_address: pod.treasury_contract_address,
        canOrganize: true
      }));

    } catch (error) {
      console.error('Failed to get available pods for events:', error);
      return [];
    }
  }

  /**
   * Check if user can create events (has management access to at least one pod)
   */
  static async canCreateEvents(
    publicClient: PublicClient,
    userAddress: string
  ): Promise<boolean> {
    try {
      const { managedPods } = await this.getUserPodAccess(publicClient, userAddress);
      return managedPods.length > 0;
    } catch (error) {
      console.error('Failed to check event creation permissions:', error);
      return false;
    }
  }
}

export default PodAccessService;
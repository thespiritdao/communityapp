import { supabase } from '@/utils/supabaseClient';
import { fetchTokenBalances } from '@/utils/fetchTokenBalances';
import {
  PodTokenService,
  type PodToken,
} from '@/features/pods/services/podTokenService';

/**
 * BountyTokenGateService - Handles token gating for bounty creation and viewing
 *
 * Features:
 * - Pod-based bounty restrictions
 * - Bounty manager permissions
 * - Member access controls for viewing bounties
 */

export interface BountyPermissions {
  canCreateBounties: boolean;
  canViewBounty: (bountyId: string) => Promise<boolean>;
  canManageBounties: boolean;
  availableGatingTokens: PodToken[];
  memberPods: string[];
  leaderPods: string[];
}

export interface BountyGatingRules {
  restrictedToPod?: string; // If set, only this pod members can view/bid
  requiredTokens?: PodToken[]; // Specific tokens required
  creatorPodId?: string; // Pod that created the bounty
  allowedRoles?: string[]; // HAT roles that can access
}

export class BountyTokenGateService {
  /**
   * Get comprehensive bounty permissions for a user
   */
  static async getUserBountyPermissions(
    userAddress: string,
  ): Promise<BountyPermissions> {
    try {
      console.log(`🎯 Loading bounty permissions for ${userAddress}`);

      // Get user's token balances
      const tokenBalances = await fetchTokenBalances(userAddress);

      // Get available tokens for gating
      const availableTokens =
        await PodTokenService.getAllTokensForGating(userAddress);

      // Get user's pod memberships
      const { memberPods, leaderPods } =
        await this.getUserPodMemberships(userAddress);

      const permissions: BountyPermissions = {
        canCreateBounties: tokenBalances.hasBountyHat || leaderPods.length > 0,
        canViewBounty: async (bountyId: string) =>
          this.canUserViewBounty(userAddress, bountyId),
        canManageBounties: tokenBalances.hasBountyHat,
        availableGatingTokens: availableTokens,
        memberPods,
        leaderPods,
      };

      console.log(`✅ Bounty permissions loaded:`, {
        canCreate: permissions.canCreateBounties,
        canManage: permissions.canManageBounties,
        memberPods: permissions.memberPods.length,
        leaderPods: permissions.leaderPods.length,
      });

      return permissions;
    } catch (error) {
      console.error('Failed to get bounty permissions:', error);
      // Return restrictive permissions on error
      return {
        canCreateBounties: false,
        canViewBounty: async () => true, // Default to open access for viewing
        canManageBounties: false,
        availableGatingTokens: [],
        memberPods: [],
        leaderPods: [],
      };
    }
  }

  /**
   * Get user's pod memberships (member and leader roles)
   */
  private static async getUserPodMemberships(userAddress: string): Promise<{
    memberPods: string[];
    leaderPods: string[];
  }> {
    try {
      const { data: pods, error } = await supabase
        .from('pods')
        .select('id, name, pod_leads, pod_members')
        .eq('status', 'active');

      if (error) {
        console.error('Error fetching pods:', error);
        return { memberPods: [], leaderPods: [] };
      }

      const memberPods: string[] = [];
      const leaderPods: string[] = [];

      for (const pod of pods || []) {
        const isLeader = pod.pod_leads?.includes(userAddress.toLowerCase());
        const isMember = pod.pod_members?.includes(userAddress.toLowerCase());

        if (isLeader) {
          leaderPods.push(pod.id);
        } else if (isMember) {
          memberPods.push(pod.id);
        }
      }

      return { memberPods, leaderPods };
    } catch (error) {
      console.error('Failed to get pod memberships:', error);
      return { memberPods: [], leaderPods: [] };
    }
  }

  /**
   * Check if user can view a specific bounty based on gating rules
   */
  private static async canUserViewBounty(
    userAddress: string,
    bountyId: string,
  ): Promise<boolean> {
    try {
      // Get bounty gating rules
      const { data: bounty, error } = await supabase
        .from('bounties')
        .select('id, creator_address, gating_rules, restriction_level')
        .eq('id', bountyId)
        .single();

      if (error || !bounty) {
        console.error('Error fetching bounty gating rules:', error);
        return true; // Default to accessible
      }

      // If no restrictions, bounty is public
      if (!bounty.gating_rules && !bounty.restriction_level) {
        return true;
      }

      // Creator can always view their own bounties
      if (bounty.creator_address?.toLowerCase() === userAddress.toLowerCase()) {
        return true;
      }

      // Parse gating rules
      const gatingRules: BountyGatingRules = bounty.gating_rules || {};

      // Check pod restrictions
      if (gatingRules.restrictedToPod) {
        const { memberPods, leaderPods } =
          await this.getUserPodMemberships(userAddress);
        const allPods = [...memberPods, ...leaderPods];

        if (!allPods.includes(gatingRules.restrictedToPod)) {
          return false;
        }
      }

      // Check token requirements
      if (gatingRules.requiredTokens && gatingRules.requiredTokens.length > 0) {
        const tokenBalances = await fetchTokenBalances(userAddress);

        // Check if user has any of the required tokens
        const hasRequiredTokens = gatingRules.requiredTokens.some((token) => {
          switch (token.symbol) {
            case 'SYSTEM':
              return Number.parseFloat(tokenBalances.systemBalance) > 0;
            case 'POC':
              return tokenBalances.hasProofOfCuriosity;
            default:
              return false; // Custom token check would go here
          }
        });

        if (!hasRequiredTokens) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking bounty view permissions:', error);
      return true; // Default to accessible on error
    }
  }

  /**
   * Filter bounties based on user's viewing permissions
   */
  static async filterViewableBounties(
    bounties: any[],
    userAddress: string,
  ): Promise<any[]> {
    if (!userAddress) {
      // Return only public bounties for non-authenticated users
      return bounties.filter(
        (bounty) => !bounty.gating_rules && !bounty.restriction_level,
      );
    }

    const viewableBounties = [];

    for (const bounty of bounties) {
      const canView = await this.canUserViewBounty(userAddress, bounty.id);
      if (canView) {
        viewableBounties.push(bounty);
      }
    }

    return viewableBounties;
  }

  /**
   * Create gating rules for a new bounty
   */
  static createBountyGatingRules(options: {
    restrictToPod?: string;
    requiredTokens?: PodToken[];
    creatorPodId?: string;
    restrictionLevel?:
      | 'public'
      | 'pod_members'
      | 'token_holders'
      | 'invite_only';
  }): BountyGatingRules {
    return {
      restrictedToPod: options.restrictToPod,
      requiredTokens: options.requiredTokens,
      creatorPodId: options.creatorPodId,
      allowedRoles: [],
    };
  }

  /**
   * Get bounty creation permissions for user's pods
   */
  static async getBountyCreationOptions(userAddress: string): Promise<{
    canCreateGlobal: boolean;
    availablePods: Array<{
      id: string;
      name: string;
      role: 'leader' | 'member';
    }>;
  }> {
    try {
      const tokenBalances = await fetchTokenBalances(userAddress);
      const { memberPods, leaderPods } =
        await this.getUserPodMemberships(userAddress);

      // Get pod details
      const { data: pods, error } = await supabase
        .from('pods')
        .select('id, name')
        .in('id', [...memberPods, ...leaderPods]);

      if (error) {
        console.error('Error fetching pod details:', error);
        return { canCreateGlobal: false, availablePods: [] };
      }

      const availablePods = (pods || []).map((pod) => ({
        id: pod.id,
        name: pod.name,
        role: leaderPods.includes(pod.id)
          ? ('leader' as const)
          : ('member' as const),
      }));

      return {
        canCreateGlobal: tokenBalances.hasBountyHat,
        availablePods,
      };
    } catch (error) {
      console.error('Failed to get creation options:', error);
      return { canCreateGlobal: false, availablePods: [] };
    }
  }
}

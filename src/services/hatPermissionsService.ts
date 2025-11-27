'use client';

import type { PublicClient } from 'viem';

// HATS Contract ABI (minimal)
const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isWearerOfHat',
    type: 'function',
    inputs: [
      { name: 'user', type: 'address' },
      { name: 'hatId', type: 'uint256' },
    ],
    outputs: [{ name: 'isWearer', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'getHatLevel',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: 'level', type: 'uint32' }],
    stateMutability: 'view',
  },
  {
    name: 'changeHatDetails',
    type: 'function',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_newDetails', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'changeHatImageURI',
    type: 'function',
    inputs: [
      { name: '_hatId', type: 'uint256' },
      { name: '_newImageURI', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'viewHat',
    type: 'function',
    inputs: [{ name: '_hatId', type: 'uint256' }],
    outputs: [
      { name: 'details', type: 'string' },
      { name: 'maxSupply', type: 'uint32' },
      { name: 'supply', type: 'uint32' },
      { name: 'eligibility', type: 'address' },
      { name: 'toggle', type: 'address' },
      { name: 'imageURI', type: 'string' },
      { name: 'lastHatId', type: 'uint16' },
      { name: 'mutable', type: 'bool' },
      { name: 'active', type: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    name: 'isActive',
    type: 'function',
    inputs: [{ name: 'hatId', type: 'uint256' }],
    outputs: [{ name: 'active', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

// Permission types
export interface HatPermissions {
  chatAccess: boolean;
  chatModeration: boolean; // 🆕 Chat moderation (delete, mute, pin)
  forumAccess: boolean; // 🆕 Forum viewing/posting access
  forumModeration: boolean;
  governanceParticipation: boolean;
  eventCreation: boolean;
  treasuryViewing: boolean;
  treasuryManagement: boolean;
  memberManagement: boolean;
  subPodCreation: boolean;
  roleAssignment: boolean;
  bountyManagement: boolean;
  marketplaceAccess: boolean;
  marketplaceManage: boolean;
}

export interface HatRole {
  hatId: string;
  name: string;
  permissions: HatPermissions;
  isLeaderRole: boolean;
  podId?: string;
}

// Predefined HAT roles configuration
export const HAT_ROLES: Record<string, HatRole> = {
  EXECUTIVE_LEADER: {
    hatId: process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER || '',
    name: 'Executive Pod Leader',
    isLeaderRole: true,
    podId: 'executive-pod',
    permissions: {
      chatAccess: true,
      governanceParticipation: true,
      eventCreation: true,
      treasuryViewing: true,
      treasuryManagement: true, // Executive pod leaders can manage treasuries
      memberManagement: true,
      subPodCreation: true,
      roleAssignment: true,
      forumModeration: true,
      bountyManagement: true,
      marketplaceAccess: true,
    },
  },
  EXECUTIVE_MEMBER: {
    hatId: process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER || '',
    name: 'Executive Pod Member',
    isLeaderRole: false,
    podId: 'executive-pod',
    permissions: {
      chatAccess: true,
      governanceParticipation: true,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false, // Members cannot manage treasuries
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: false,
      marketplaceAccess: true,
    },
  },
  DEV_LEADER: {
    hatId: process.env.NEXT_PUBLIC_DEV_POD_LEADER || '',
    name: 'Development Pod Leader',
    isLeaderRole: true,
    podId: 'dev-pod',
    permissions: {
      chatAccess: true,
      governanceParticipation: true,
      eventCreation: true,
      treasuryViewing: true,
      treasuryManagement: true, // Pod leaders can manage their pod's treasury
      memberManagement: true,
      subPodCreation: true,
      roleAssignment: true,
      forumModeration: false,
      bountyManagement: true,
      marketplaceAccess: true,
    },
  },
  DEV_MEMBER: {
    hatId: process.env.NEXT_PUBLIC_DEV_POD_MEMBER || '',
    name: 'Development Pod Member',
    isLeaderRole: false,
    podId: 'dev-pod',
    permissions: {
      chatAccess: true,
      governanceParticipation: true,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: false,
      marketplaceAccess: true,
    },
  },
  // Legacy management roles (maintained for compatibility)
  MARKET_MANAGER: {
    hatId: process.env.NEXT_PUBLIC_MARKET_MANAGEMENT || '',
    name: 'Market Manager',
    isLeaderRole: false,
    permissions: {
      chatAccess: true,
      governanceParticipation: false,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: false,
      marketplaceAccess: true,
    },
  },
  BOUNTY_MANAGER: {
    hatId: process.env.NEXT_PUBLIC_BOUNTY_MANAGEMENT || '',
    name: 'Bounty Manager',
    isLeaderRole: false,
    permissions: {
      chatAccess: true,
      governanceParticipation: false,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: true,
      marketplaceAccess: false,
    },
  },
  FORUM_MANAGER: {
    hatId: process.env.NEXT_PUBLIC_FORUM_MANAGEMENT || '',
    name: 'Forum Manager',
    isLeaderRole: false,
    permissions: {
      chatAccess: true,
      governanceParticipation: false,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: true,
      bountyManagement: false,
      marketplaceAccess: false,
    },
  },
  CHAT_MANAGER: {
    hatId: process.env.NEXT_PUBLIC_CHAT_MANAGEMENT || '',
    name: 'Chat Manager',
    isLeaderRole: false,
    permissions: {
      chatAccess: true,
      governanceParticipation: false,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: false,
      marketplaceAccess: false,
    },
  },
  EVENT_MANAGER: {
    hatId: process.env.NEXT_PUBLIC_EVENT_MANAGEMENT || '',
    name: 'Event Manager',
    isLeaderRole: false,
    permissions: {
      chatAccess: true,
      governanceParticipation: false,
      eventCreation: true,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: false,
      marketplaceAccess: false,
    },
  },
};

/**
 * Service for checking HAT-based permissions
 * Replaces database-driven permission checking with on-chain HAT verification
 */
export class HatPermissionsService {
  private publicClient: PublicClient;
  private hatsContractAddress: `0x${string}`;

  // Aggressive caching to prevent rate limiting
  private hatBalanceCache = new Map<
    string,
    { balance: boolean; timestamp: number }
  >();
  private hatStatusCache = new Map<
    string,
    { active: boolean; timestamp: number }
  >();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache
  private readonly MAX_CACHE_SIZE = 1000; // Prevent memory leaks

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient;
    this.hatsContractAddress = (process.env.NEXT_PUBLIC_HATS_CONTRACT ||
      '') as `0x${string}`;

    if (!this.hatsContractAddress) {
      throw new Error('HATS contract address not configured');
    }
  }

  /**
   * Check if user has a specific HAT
   */
  async hasHat(userAddress: string, hatId: string): Promise<boolean> {
    const cacheKey = `${userAddress}-${hatId}`;
    const cached = this.hatBalanceCache.get(cacheKey);

    // Return cached result if still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.balance;
    }

    try {
      const balance = await this.publicClient.readContract({
        address: this.hatsContractAddress,
        abi: HATS_ABI,
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`, BigInt(hatId)],
      });

      const hasBalance = Number(balance) > 0;

      // Cache the result
      this.hatBalanceCache.set(cacheKey, {
        balance: hasBalance,
        timestamp: Date.now(),
      });

      // Cleanup cache periodically (every 100 calls)
      if (this.hatBalanceCache.size % 100 === 0) {
        this.cleanupCache();
      }

      return hasBalance;
    } catch (error) {
      console.error(`Failed to check HAT ${hatId} for ${userAddress}:`, error);
      // Cache negative result for shorter time to allow retry
      this.hatBalanceCache.set(cacheKey, {
        balance: false,
        timestamp: Date.now() - this.CACHE_DURATION + 30000, // 30 second retry
      });
      return false;
    }
  }

  /**
   * Get all HATs that a user possesses
   */
  async getUserHats(userAddress: string): Promise<string[]> {
    const userHats: string[] = [];

    // Check all configured HAT roles
    for (const role of Object.values(HAT_ROLES)) {
      if (role.hatId && (await this.hasHat(userAddress, role.hatId))) {
        userHats.push(role.hatId);
      }
    }

    return userHats;
  }

  /**
   * Get user's roles based on their HATs
   */
  async getUserRoles(userAddress: string): Promise<HatRole[]> {
    const userRoles: HatRole[] = [];

    for (const role of Object.values(HAT_ROLES)) {
      if (role.hatId && (await this.hasHat(userAddress, role.hatId))) {
        userRoles.push(role);
      }
    }

    return userRoles;
  }

  /**
   * Get consolidated permissions for a user
   */
  async getUserPermissions(userAddress: string): Promise<HatPermissions> {
    const userRoles = await this.getUserRoles(userAddress);

    // Start with no permissions
    const permissions: HatPermissions = {
      chatAccess: false,
      governanceParticipation: false,
      eventCreation: false,
      treasuryViewing: false,
      treasuryManagement: false,
      memberManagement: false,
      subPodCreation: false,
      roleAssignment: false,
      forumModeration: false,
      bountyManagement: false,
      marketplaceAccess: false,
    };

    // Combine permissions from all roles (OR operation)
    for (const role of userRoles) {
      Object.keys(permissions).forEach((key) => {
        const permKey = key as keyof HatPermissions;
        permissions[permKey] =
          permissions[permKey] || role.permissions[permKey];
      });
    }

    return permissions;
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(
    userAddress: string,
    permission: keyof HatPermissions,
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(userAddress);
    return permissions[permission];
  }

  /**
   * Check if user can access chat
   */
  async canAccessChat(
    userAddress: string,
    chatGroupId?: string,
  ): Promise<boolean> {
    return await this.hasPermission(userAddress, 'chatAccess');
  }

  /**
   * Check if user can participate in governance
   */
  async canParticipateInGovernance(userAddress: string): Promise<boolean> {
    return await this.hasPermission(userAddress, 'governanceParticipation');
  }

  /**
   * Check if user can create events
   */
  async canCreateEvents(userAddress: string): Promise<boolean> {
    return await this.hasPermission(userAddress, 'eventCreation');
  }

  /**
   * Check if user can view treasury
   */
  async canViewTreasury(userAddress: string, podId?: string): Promise<boolean> {
    return await this.hasPermission(userAddress, 'treasuryViewing');
  }

  /**
   * Check if user can manage pod members
   */
  async canManageMembers(
    userAddress: string,
    podId?: string,
  ): Promise<boolean> {
    return await this.hasPermission(userAddress, 'memberManagement');
  }

  /**
   * Check if user can create sub-pods
   */
  async canCreateSubPods(
    userAddress: string,
    parentPodId?: string,
  ): Promise<boolean> {
    return await this.hasPermission(userAddress, 'subPodCreation');
  }

  /**
   * Check if user is a pod leader (has any leadership role)
   */
  async isPodLeader(userAddress: string): Promise<boolean> {
    const roles = await this.getUserRoles(userAddress);
    return roles.some((role) => role.isLeaderRole);
  }

  /**
   * Get pods that user can manage (based on their leadership roles)
   */
  async getManagedPods(userAddress: string): Promise<string[]> {
    const roles = await this.getUserRoles(userAddress);
    const managedPods: string[] = [];

    for (const role of roles) {
      if (
        role.isLeaderRole &&
        role.podId &&
        !managedPods.includes(role.podId)
      ) {
        managedPods.push(role.podId);
      }
    }

    return managedPods;
  }

  /**
   * Check if HAT is active
   */
  async isHatActive(hatId: string): Promise<boolean> {
    const cached = this.hatStatusCache.get(hatId);

    // Return cached result if still valid
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.active;
    }

    try {
      const isActive = await this.publicClient.readContract({
        address: this.hatsContractAddress,
        abi: HATS_ABI,
        functionName: 'isActive',
        args: [BigInt(hatId)],
      });

      // Cache the result
      this.hatStatusCache.set(hatId, {
        active: isActive,
        timestamp: Date.now(),
      });

      return isActive;
    } catch (error) {
      console.error(`Failed to check if HAT ${hatId} is active:`, error);
      // Cache negative result for shorter time
      this.hatStatusCache.set(hatId, {
        active: false,
        timestamp: Date.now() - this.CACHE_DURATION + 30000,
      });
      return false;
    }
  }

  /**
   * Get HAT level (depth in tree)
   */
  async getHatLevel(hatId: string): Promise<number> {
    try {
      const level = await this.publicClient.readContract({
        address: this.hatsContractAddress,
        abi: HATS_ABI,
        functionName: 'getHatLevel',
        args: [BigInt(hatId)],
      });

      return Number(level);
    } catch (error) {
      console.error(`Failed to get HAT level for ${hatId}:`, error);
      return 0;
    }
  }

  /**
   * Batch check multiple HATs for a user
   */
  async batchCheckHats(
    userAddress: string,
    hatIds: string[],
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    // Execute all checks in parallel for efficiency
    const checks = hatIds.map(async (hatId) => {
      const hasHat = await this.hasHat(userAddress, hatId);
      results[hatId] = hasHat;
    });

    await Promise.all(checks);

    return results;
  }

  /**
   * Clear expired cache entries and limit cache size
   */
  private cleanupCache(): void {
    const now = Date.now();

    // Clean balance cache
    for (const [key, value] of this.hatBalanceCache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.hatBalanceCache.delete(key);
      }
    }

    // Clean status cache
    for (const [key, value] of this.hatStatusCache.entries()) {
      if (now - value.timestamp > this.CACHE_DURATION) {
        this.hatStatusCache.delete(key);
      }
    }

    // Limit cache size (remove oldest entries if too large)
    if (this.hatBalanceCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.hatBalanceCache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp,
      );

      const toRemove = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => this.hatBalanceCache.delete(key));
    }
  }

  /**
   * Clear all caches (useful for testing or when data might be stale)
   */
  public clearCache(): void {
    this.hatBalanceCache.clear();
    this.hatStatusCache.clear();
  }
}

// Utility function to get user permissions (used in components)
export const getUserPermissions = async (
  publicClient: PublicClient,
  userAddress: string,
): Promise<HatPermissions> => {
  const service = new HatPermissionsService(publicClient);
  return await service.getUserPermissions(userAddress);
};

// Utility function to check specific permission
export const checkPermission = async (
  publicClient: PublicClient,
  userAddress: string,
  permission: keyof HatPermissions,
): Promise<boolean> => {
  const service = new HatPermissionsService(publicClient);
  return await service.hasPermission(userAddress, permission);
};

// Export singleton service for use in hooks
let hatPermissionsService: HatPermissionsService | null = null;

export const getHatPermissionsService = (
  publicClient: PublicClient,
): HatPermissionsService => {
  if (!hatPermissionsService) {
    hatPermissionsService = new HatPermissionsService(publicClient);
  }
  return hatPermissionsService;
};

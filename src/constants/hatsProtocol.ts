/**
 * Hats Protocol Constants
 *
 * Contract addresses and HAT IDs for role-based access control
 */

// Hats Protocol contract address on Base mainnet
export const HATS_PROTOCOL_ADDRESS = '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

/**
 * HAT ID mappings for permission types
 * These map to specific HAT tokens that users must hold to access certain features
 *
 * HAT IDs are stored in the database in pod_role_permissions table
 * and should be fetched dynamically per pod. These are fallback/example values.
 */
export const HAT_ID_PERMISSIONS = {
  // Example HAT IDs - actual IDs should be fetched from database per pod
  EXAMPLE_EXECUTIVE_POD_LEADER: BigInt(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER || '0'),
  EXAMPLE_DEV_POD_LEADER: BigInt(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID || '0'),
} as const;

/**
 * Get HAT ID from pod role
 *
 * In production, this should query the database to get the HAT ID
 * associated with a specific pod and role.
 *
 * @param podId - The pod identifier
 * @param roleName - The role name (e.g., "Leader", "Member")
 * @returns The HAT ID as a bigint
 */
export async function getHatIdForPodRole(
  podId: string,
  roleName: string
): Promise<bigint | null> {
  // TODO: Query database to get HAT ID from pod_role_permissions
  // For now, return null and let the hook handle it
  return null;
}

/**
 * Permission to HAT mapping
 *
 * Maps permission keys to the type of HAT required.
 * In practice, each pod may have different HAT IDs for these roles.
 */
export const PERMISSION_HAT_MAPPING = {
  bountyManagement: 'Leader',
  treasuryManagement: 'Leader',
  marketplaceManage: 'Leader',
  eventCreation: 'Leader',
  memberManagement: 'Leader',
  podManagement: 'Leader',
  // Lower privilege permissions
  chatParticipation: 'Member',
  governanceParticipation: 'Member',
} as const;

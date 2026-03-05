/**
 * Hats Protocol Constants
 *
 * Contract address and hat ID helpers for role-based access control.
 * Hat IDs are sourced from pod_role_permissions.token_address via
 * src/lib/hatRegistry.ts — not from environment variables.
 */

import { createClient } from '@supabase/supabase-js';

// Hats Protocol contract address on Base mainnet
export const HATS_PROTOCOL_ADDRESS =
  '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137' as const;

/**
 * Get HAT ID for a specific pod role.
 *
 * Queries pod_role_permissions to find the token_address for the given
 * pod + role. This is the primary DB-backed hat ID lookup for arbitrary pods.
 *
 * For the fixed system roles (exec leader, community parent, TN member),
 * prefer getHatId() from src/lib/hatRegistry.ts which caches results.
 *
 * @param podId   — The pod UUID
 * @param roleName — The role_name value (e.g. "Temporal Naturalism Member")
 * @returns The hat ID as a bigint, or null if not found / not active
 */
export async function getHatIdForPodRole(
  podId: string,
  roleName: string,
): Promise<bigint | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data } = await supabase
      .from('pod_role_permissions')
      .select('token_address')
      .eq('pod_id', podId)
      .ilike('role_name', roleName)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!data?.token_address?.startsWith('0x')) return null;
    return BigInt(data.token_address);
  } catch {
    return null;
  }
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
  chatParticipation: 'Member',
  governanceParticipation: 'Member',
} as const;

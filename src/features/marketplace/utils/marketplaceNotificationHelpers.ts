import { supabase } from '@/utils/supabaseClient';

/**
 * Marketplace Notification Helpers
 *
 * Utilities for marketplace-related notifications using HATS-based membership.
 *
 * REPLACES: Legacy notificationService.getFulfillmentManagers()
 * REASON: Old method fetched ALL users and checked RPC token balances - extremely inefficient
 * NEW APPROACH: Query membership tables directly using HATS architecture
 *
 * @see PHASE_2_NOTIFICATION_CONSOLIDATION_PLAN.md
 */

export interface FulfillmentManager {
  wallet_address: string;
}

/**
 * Pod ID mapping for marketplace fulfillment
 *
 * These map the requiredToken parameter from marketplace products
 * to actual pod IDs in the database.
 */
const POD_ID_MAP: Record<string, string> = {
  exec: 'exec',
  dev: 'dev',
  bounty: 'bounty',
  curiosity: 'curiosity',
  market_admin: 'marketplace',
};

/**
 * Get fulfillment managers for marketplace orders
 *
 * Marketplace fulfillment requires users to have BOTH:
 * 1. Market management hat (general marketplace access)
 * 2. Pod-specific hat (for the product's required token)
 *
 * ARCHITECTURE:
 * - Uses active_pod_members table for indexed membership lookup
 * - Falls back to pods.pod_leads array if table doesn't exist
 * - No RPC calls - pure database queries
 * - Deduplicates results by wallet address
 *
 * @param requiredToken - The product's required token ('exec', 'dev', 'bounty', 'curiosity', 'market_admin', or null)
 * @returns Array of qualified fulfillment managers
 *
 * @example
 * ```typescript
 * // Product requires executive pod membership
 * const managers = await getFulfillmentManagers('exec');
 * // Returns users who have BOTH market management AND executive pod hats
 *
 * // Product has no special requirement
 * const managers = await getFulfillmentManagers(null);
 * // Returns users who have market management hat only
 * ```
 */
export async function getFulfillmentManagers(
  requiredToken: string | null,
): Promise<FulfillmentManager[]> {
  try {
    console.log(
      '🛒 Finding fulfillment managers for required token:',
      requiredToken,
    );

    // Step 1: Get users with market management hat
    const marketManagers = await getMarketManagers();
    console.log(`📊 Found ${marketManagers.length} market managers`);

    // Step 2: If no pod-specific requirement, return market managers
    if (!requiredToken || requiredToken === 'market_admin') {
      console.log(
        '✅ No pod-specific requirement, returning all market managers',
      );
      return marketManagers;
    }

    // Step 3: Get pod-specific members
    const podId = POD_ID_MAP[requiredToken];
    if (!podId) {
      console.warn(
        `⚠️ Unknown required token: ${requiredToken}, defaulting to market managers only`,
      );
      return marketManagers;
    }

    const podMembers = await getPodMembers(podId);
    console.log(`📊 Found ${podMembers.length} members in ${podId} pod`);

    // Step 4: Find intersection (users with BOTH hats)
    const qualifiedManagers = marketManagers.filter((manager) =>
      podMembers.some(
        (member) =>
          member.wallet_address.toLowerCase() ===
          manager.wallet_address.toLowerCase(),
      ),
    );

    console.log(
      `✅ Found ${qualifiedManagers.length} qualified fulfillment managers with both hats`,
    );
    return deduplicateManagers(qualifiedManagers);
  } catch (error) {
    console.error('❌ Error getting fulfillment managers:', error);
    return [];
  }
}

/**
 * Get all market managers (users with market management hat)
 *
 * Market management hat holders can fulfill marketplace orders.
 */
async function getMarketManagers(): Promise<FulfillmentManager[]> {
  try {
    // Strategy 1: Try active_pod_members table
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('wallet')
        .eq('pod_id', 'marketplace')
        .in('membership_type', ['leader', 'admin']);

      if (!error && data && data.length > 0) {
        console.log(
          `✅ Found ${data.length} market managers from active_pod_members`,
        );
        return data.map((member) => ({ wallet_address: member.wallet }));
      }

      // If error is not "table doesn't exist", throw it
      if (error && error.code !== '42P01') {
        throw error;
      }

      console.log(
        '⚠️ active_pod_members table not found or empty, falling back to pods table',
      );
    } catch (indexedError) {
      console.log('⚠️ Indexed lookup failed, falling back to pods table');
    }

    // Strategy 2: Fallback to pods table (marketplace pod leaders)
    const { data: podData, error: podError } = await supabase
      .from('pods')
      .select('pod_leads')
      .eq('id', 'marketplace')
      .eq('is_active', true)
      .single();

    if (podError) {
      if (podError.code === 'PGRST116') {
        console.warn('⚠️ Marketplace pod not found in database');
        return [];
      }
      throw podError;
    }

    if (!podData?.pod_leads || podData.pod_leads.length === 0) {
      console.warn('⚠️ Marketplace pod exists but has no leaders assigned');
      return [];
    }

    console.log(
      `✅ Found ${podData.pod_leads.length} market managers from pods.pod_leads`,
    );
    return podData.pod_leads.map((wallet: string) => ({ wallet_address: wallet }));
  } catch (error) {
    console.error('❌ Error getting market managers:', error);
    return [];
  }
}

/**
 * Get members of a specific pod
 *
 * @param podId - The ID of the pod ('exec', 'dev', 'bounty', etc.)
 * @returns Array of pod members
 */
async function getPodMembers(podId: string): Promise<FulfillmentManager[]> {
  try {
    // Strategy 1: Try active_pod_members table
    try {
      const { data, error } = await supabase
        .from('active_pod_members')
        .select('wallet')
        .eq('pod_id', podId);

      if (!error && data && data.length > 0) {
        console.log(
          `✅ Found ${data.length} members in ${podId} pod from active_pod_members`,
        );
        return data.map((member) => ({ wallet_address: member.wallet }));
      }

      if (error && error.code !== '42P01') {
        throw error;
      }

      console.log(
        `⚠️ active_pod_members lookup failed for ${podId}, falling back to pods table`,
      );
    } catch (indexedError) {
      console.log(
        `⚠️ Indexed lookup failed for ${podId}, falling back to pods table`,
      );
    }

    // Strategy 2: Fallback to pods table
    const { data: podData, error: podError } = await supabase
      .from('pods')
      .select('pod_leads')
      .eq('id', podId)
      .single();

    if (podError) {
      if (podError.code === 'PGRST116') {
        console.warn(`⚠️ Pod ${podId} not found in database`);
        return [];
      }
      throw podError;
    }

    if (!podData?.pod_leads || podData.pod_leads.length === 0) {
      console.warn(`⚠️ Pod ${podId} exists but has no leaders assigned`);
      return [];
    }

    console.log(
      `✅ Found ${podData.pod_leads.length} members in ${podId} pod from pods.pod_leads`,
    );
    return podData.pod_leads.map((wallet: string) => ({ wallet_address: wallet }));
  } catch (error) {
    console.error(`❌ Error getting ${podId} pod members:`, error);
    return [];
  }
}

/**
 * Deduplicate managers by wallet address
 *
 * @param managers - Array of managers that may contain duplicates
 * @returns Deduplicated array
 */
function deduplicateManagers(
  managers: FulfillmentManager[],
): FulfillmentManager[] {
  const seen = new Set<string>();
  const unique: FulfillmentManager[] = [];

  for (const manager of managers) {
    const normalized = manager.wallet_address.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      unique.push(manager);
    }
  }

  if (managers.length !== unique.length) {
    console.log(
      `🔄 Deduplicated ${managers.length - unique.length} duplicate managers`,
    );
  }

  return unique;
}

/**
 * Get user profile for display purposes
 *
 * @param address - Wallet address
 * @returns User profile with first_name and last_name
 */
export async function getUserProfile(address: string): Promise<{
  first_name: string | null;
  last_name: string | null;
} | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('first_name, last_name')
      .eq('wallet_address', address.toLowerCase())
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Profile not found
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * Format user display name from profile or wallet address
 *
 * @param address - Wallet address
 * @param profile - Optional user profile
 * @returns Formatted display name
 */
export function formatUserDisplayName(
  address: string,
  profile?: { first_name: string | null; last_name: string | null } | null,
): string {
  if (profile?.first_name || profile?.last_name) {
    const name =
      `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    if (name) return name;
  }

  // Fallback to shortened address
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Access Control Utilities
 *
 * Centralized utilities for token gating and HAT-based access control
 * using the new link table system.
 */

import { supabase } from './supabaseClient';

/**
 * Normalize addresses for consistent comparison
 * All addresses should be lowercase for case-insensitive matching
 */
export const normalizeAddress = (addr?: string | null): string => {
  return addr?.trim().toLowerCase() || '';
};

/**
 * Normalize an array of addresses
 */
export const normalizeAddresses = (
  addresses: (string | null | undefined)[],
): string[] => {
  return addresses
    .filter(Boolean)
    .map((addr) => normalizeAddress(addr))
    .filter((addr) => addr.length > 0);
};

/**
 * Check if two addresses are equal (case-insensitive)
 */
export const addressEquals = (
  addr1?: string | null,
  addr2?: string | null,
): boolean => {
  return normalizeAddress(addr1) === normalizeAddress(addr2);
};

/**
 * Check if an address is in an array of addresses (case-insensitive)
 */
export const addressInArray = (
  address: string | null | undefined,
  addresses: (string | null | undefined)[],
): boolean => {
  if (!address) return false;
  const normalizedAddress = normalizeAddress(address);
  return normalizeAddresses(addresses).includes(normalizedAddress);
};

/**
 * User identity for access control checks
 */
export interface UserIdentity {
  userTokens: string[]; // Normalized token addresses the user holds
  userHats: string[]; // Normalized hat IDs the user holds
}

/**
 * Get user identity from token balances and HAT permissions
 */
export const getUserIdentity = async (
  userAddress: string,
  tokenBalances?: any,
  userHats?: string[],
): Promise<UserIdentity> => {
  const userTokens: string[] = [];
  const discoveredHats: string[] = [];

  // Add tokens based on balance checks
  if (tokenBalances) {
    if (tokenBalances.hasProofOfCuriosity) {
      userTokens.push(
        normalizeAddress(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY),
      );
    }
    if (tokenBalances.hasExecutivePod) {
      userTokens.push(
        normalizeAddress(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER),
      );
    }
    if (tokenBalances.hasDevPod) {
      userTokens.push(normalizeAddress(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID));
    }
    if (tokenBalances.hasMarketAdmin || tokenBalances.hasMarketManagement) {
      userTokens.push(normalizeAddress(process.env.NEXT_PUBLIC_MARKET_ADMIN));
    }
    // Add Beta Tester Hat if user has it
    if (tokenBalances.hasBetaTesterHat) {
      discoveredHats.push(
        normalizeAddress(process.env.NEXT_PUBLIC_BETA_TESTER_HAT),
      );
    }
  }

  // Get all hat IDs the user actually holds by querying the pod permissions
  if (userAddress) {
    try {
      const { data: permissions, error } = await supabase
        .from('pod_permission_lookup')
        .select('token_address, role_name, pod_id')
        .eq('is_active', true);

      if (!error && permissions) {
        // We'll need to check each hat individually using the HATs contract
        // For now, add the hat IDs that we know the user should have based on permissions
        for (const perm of permissions) {
          if (perm.token_address) {
            discoveredHats.push(normalizeAddress(perm.token_address));
          }
        }
      }
    } catch (error) {
      console.error('🔐 Error fetching user hat permissions:', error);
    }
  }

  // Add explicitly provided HAT IDs
  const providedHats = normalizeAddresses(userHats || []);
  const allHats = [...new Set([...discoveredHats, ...providedHats])];

  return {
    userTokens: [...new Set(userTokens.filter(Boolean))], // Remove duplicates and empty strings
    userHats: allHats,
  };
};

/**
 * Call the forums_accessible_by_identity RPC function
 */
export const getAccessibleForums = async (identity: UserIdentity) => {
  try {
    const { data, error } = await supabase.rpc(
      'forums_accessible_by_identity',
      {
        user_tokens: identity.userTokens,
        user_hats: identity.userHats,
      },
    );

    if (error) {
      console.error('Error calling forums_accessible_by_identity:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Failed to get accessible forums:', error);
    throw error;
  }
};

/**
 * Check if user has access to a specific forum category
 */
export const hasForumAccess = async (
  categoryId: string,
  identity: UserIdentity,
): Promise<boolean> => {
  try {
    const accessibleForums = await getAccessibleForums(identity);
    return accessibleForums.some((forum: any) => forum.id === categoryId);
  } catch (error) {
    console.error('Error checking forum access:', error);
    return false;
  }
};

/**
 * Get user's accessible chat groups based on identity
 * TODO: Implement similar RPC pattern for chat groups
 */
export const getAccessibleChatGroups = async (identity: UserIdentity) => {
  try {
    // For now, fall back to checking forum_category_required_tokens pattern
    // This should eventually have its own chat_group_required_tokens table

    const { data: chatGroups, error } = await supabase
      .from('chat_groups')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Filter based on required tokens
    const accessibleGroups = (chatGroups || []).filter((group: any) => {
      const requiredToken = normalizeAddress(group.required_token);

      // No token requirement - allow access
      if (!requiredToken) {
        return true;
      }

      // Check if user has the required token or HAT
      return (
        identity.userTokens.includes(requiredToken) ||
        identity.userHats.includes(requiredToken)
      );
    });

    return accessibleGroups;
  } catch (error) {
    console.error('Failed to get accessible chat groups:', error);
    throw error;
  }
};

/**
 * Get user's accessible products based on identity
 * TODO: Implement product_required_tokens link table
 */
export const getAccessibleProducts = async (identity: UserIdentity) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    // Filter based on required tokens
    const accessibleProducts = (products || []).filter((product: any) => {
      const requiredToken = normalizeAddress(product.required_token);

      // No token requirement - allow access
      if (!requiredToken) {
        return true;
      }

      // Check if user has the required token or HAT
      return (
        identity.userTokens.includes(requiredToken) ||
        identity.userHats.includes(requiredToken)
      );
    });

    return accessibleProducts;
  } catch (error) {
    console.error('Failed to get accessible products:', error);
    throw error;
  }
};

/**
 * Check governance participation eligibility
 */
export const canParticipateInGovernance = (
  identity: UserIdentity,
  requiredTokens?: string[],
): boolean => {
  // Default governance tokens if none specified
  const defaultGovTokens = [
    normalizeAddress(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY),
    normalizeAddress(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER),
    normalizeAddress(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID),
  ].filter(Boolean);

  // Default governance HATs if none specified
  const defaultGovHats = [
    normalizeAddress(process.env.NEXT_PUBLIC_BETA_TESTER_HAT),
  ].filter(Boolean);

  const tokensToCheck = requiredTokens
    ? normalizeAddresses(requiredTokens)
    : defaultGovTokens;

  return (
    tokensToCheck.some((token) => identity.userTokens.includes(token)) ||
    defaultGovHats.some((hat) => identity.userHats.includes(hat)) ||
    identity.userHats.length > 0 // Any HAT grants governance participation
  );
};

/**
 * Check bounty system eligibility
 */
export const canAccessBounties = (identity: UserIdentity): boolean => {
  // Bounties typically require Executive Pod, Dev Pod, or Market Admin access
  const bountyTokens = [
    normalizeAddress(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER),
    normalizeAddress(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID),
    normalizeAddress(process.env.NEXT_PUBLIC_MARKET_ADMIN),
  ].filter(Boolean);

  // Default bounty HATs
  const bountyHats = [
    normalizeAddress(process.env.NEXT_PUBLIC_BETA_TESTER_HAT),
  ].filter(Boolean);

  return (
    bountyTokens.some((token) => identity.userTokens.includes(token)) ||
    bountyHats.some((hat) => identity.userHats.includes(hat)) ||
    identity.userHats.length > 0 // Any HAT grants bounty access
  );
};

/**
 * Legacy compatibility function - maps old token balance checks to new system
 * @deprecated Use getUserIdentity instead
 */
export const mapTokenBalancesToIdentity = (
  tokenBalances: any,
): Partial<UserIdentity> => {
  const userTokens: string[] = [];

  if (tokenBalances?.hasProofOfCuriosity) {
    userTokens.push(
      normalizeAddress(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY),
    );
  }
  if (tokenBalances?.hasExecutivePod) {
    userTokens.push(
      normalizeAddress(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER),
    );
  }
  if (tokenBalances?.hasDevPod) {
    userTokens.push(normalizeAddress(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID));
  }
  if (tokenBalances?.hasMarketAdmin || tokenBalances?.hasMarketManagement) {
    userTokens.push(normalizeAddress(process.env.NEXT_PUBLIC_MARKET_ADMIN));
  }

  return {
    userTokens: [...new Set(userTokens.filter(Boolean))],
  };
};

/**
 * Get user's accessible events based on identity
 */
export const getAccessibleEvents = async (identity: UserIdentity) => {
  try {
    const { data, error } = await supabase.rpc(
      'events_accessible_by_identity',
      {
        user_tokens: identity.userTokens,
        user_hats: identity.userHats,
      },
    );

    if (error) {
      console.error('Error calling events_accessible_by_identity:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Failed to get accessible events:', error);
    throw error;
  }
};

/**
 * Check if user has access to a specific event
 */
export const hasEventAccess = async (
  eventId: string,
  identity: UserIdentity,
): Promise<boolean> => {
  try {
    // First, check if this is an unrestricted event (no token requirements)
    // or if user is the creator
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('required_tokens, creator_address')
      .eq('id', eventId)
      .single();

    if (eventError) {
      console.error('Error fetching event details:', eventError);
      // Fall through to RPC check
    } else if (event) {
      // If event has no required tokens, everyone can access
      if (!event.required_tokens || event.required_tokens.length === 0) {
        console.log(`🎪 Event ${eventId} has no token requirements - granting access`);
        return true;
      }

      // If user is the creator, grant access
      if (identity.userAddress && event.creator_address.toLowerCase() === identity.userAddress.toLowerCase()) {
        console.log(`🎪 User is creator of event ${eventId} - granting access`);
        return true;
      }
    }

    // Fall back to RPC check for token-gated events
    const accessibleEvents = await getAccessibleEvents(identity);
    return accessibleEvents.some((event: any) => event.id === eventId);
  } catch (error) {
    console.error('Error checking event access:', error);
    return false;
  }
};

/**
 * Check if user can register for events
 */
export const canRegisterForEvents = (identity: UserIdentity): boolean => {
  // Users with any token or HAT can typically register for events
  return identity.userTokens.length > 0 || identity.userHats.length > 0;
};

/**
 * Check if user can create events
 */
export const canCreateEvents = (identity: UserIdentity): boolean => {
  // Event creation typically requires pod membership or specific tokens
  const creationTokens = [
    normalizeAddress(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER),
    normalizeAddress(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID),
    normalizeAddress(process.env.NEXT_PUBLIC_MARKET_ADMIN),
  ].filter(Boolean);

  return (
    creationTokens.some((token) => identity.userTokens.includes(token)) ||
    identity.userHats.length > 0 // Any HAT grants event creation access
  );
};

/**
 * Debug helper to log user identity
 */
export const logUserIdentity = (
  identity: UserIdentity,
  label = 'User Identity',
) => {
  console.log(`🔐 ${label}:`, {
    tokens: identity.userTokens.length,
    hats: identity.userHats.length,
    tokenList: identity.userTokens,
    hatList: identity.userHats,
  });
};

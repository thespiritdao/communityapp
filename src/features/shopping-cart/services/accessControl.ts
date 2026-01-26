// src/features/shopping-cart/services/accessControl.ts
import { getUserIdentity, type UserIdentity } from '@/utils/accessControlUtils';
import { supabase } from '@/lib/supabase';
import type { IProduct } from '../models';

/**
 * 🛒 Shopping Cart Access Control Service
 *
 * Integrates shopping cart with the unified multi-token access control system.
 * Replaces hardcoded token checking with normalized access control patterns.
 */

/**
 * Resolve a pod role ID to the actual hat ID
 * Format: pod_${podId}_${roleName} -> actual hat_id from database
 */
async function resolvePodRoleToHatId(
  podRoleId: string,
): Promise<string | null> {
  try {
    // Parse the pod role ID: pod_${podId}_${roleName}
    const parts = podRoleId.split('_');
    if (parts.length < 3 || parts[0] !== 'pod') {
      return null;
    }

    const podId = parts[1];
    const roleName = parts.slice(2).join('_'); // Rejoin in case role name has underscores

    // Convert back to readable role name
    const readableRoleName = roleName.replace(/_/g, ' ');

    console.log(
      `🛒 Resolving pod role: podId=${podId}, role=${readableRoleName}`,
    );

    // Query the database for the hat ID
    const { data, error } = await supabase
      .from('pod_permission_lookup')
      .select('hat_id, role_name')
      .eq('pod_id', podId)
      .eq('is_active', true);

    if (error || !data) {
      console.error('🛒 Error resolving pod role:', error);
      return null;
    }

    // Find the matching role (case-insensitive)
    const matchingRole = data.find(
      (perm) => perm.role_name.toLowerCase() === readableRoleName.toLowerCase(),
    );

    if (matchingRole) {
      console.log(`🛒 Resolved ${podRoleId} -> ${matchingRole.hat_id}`);
      return matchingRole.hat_id;
    }

    console.log(`🛒 No matching role found for ${podRoleId}`);
    return null;
  } catch (error) {
    console.error('🛒 Error in resolvePodRoleToHatId:', error);
    return null;
  }
}

/**
 * Check if a user can access a specific product based on token requirements
 */
export const canUserAccessProduct = (
  product: IProduct,
  userIdentity: UserIdentity,
): boolean => {
  const requiredToken = product.required_token || product.requiredToken;

  if (!requiredToken) {
    return true; // No token requirement
  }

  // Normalize the required token for comparison
  const normalizedRequired = requiredToken.toLowerCase();

  // Helper function to check if user has a specific token or hat
  const hasTokenOrHat = (envVar: string | undefined): boolean => {
    if (!envVar) return false;
    const normalizedEnv = envVar.toLowerCase();
    return (
      userIdentity.userTokens.includes(normalizedEnv) ||
      userIdentity.userHats.includes(normalizedEnv)
    );
  };

  // Check for new dynamic pod role gating (format: pod_${podId}_${roleName})
  if (requiredToken.startsWith('pod_')) {
    console.log(`🛒 Checking pod role gating: ${requiredToken}`);
    console.log(`🛒 User hats: ${userIdentity.userHats.join(', ')}`);

    // This is a pod role requirement - we need to resolve it to a hat ID
    // Since this function is sync but resolution is async, we need to use the async version
    // For now, return false to force use of the async version
    console.log(
      `🛒 Pod role gating requires async resolution - deferring to async check`,
    );
    return false;
  }

  // Legacy token mapping for backward compatibility
  switch (requiredToken) {
    case 'exec':
      return (
        hasTokenOrHat(process.env.NEXT_PUBLIC_EXECUTIVE_POD_LEADER) ||
        hasTokenOrHat(process.env.NEXT_PUBLIC_EXECUTIVE_POD_MEMBER)
      );
    case 'dev':
      return hasTokenOrHat(process.env.NEXT_PUBLIC_DEV_POD_HAT_ID);
    case 'bounty':
      return hasTokenOrHat(process.env.NEXT_PUBLIC_BOUNTY_HAT);
    case 'poc':
    case 'curiosity':
      return hasTokenOrHat(process.env.NEXT_PUBLIC_PROOF_OF_CURIOSITY);
    case 'advocate':
      return hasTokenOrHat(process.env.NEXT_PUBLIC_ADVOCATE);
    case 'market_admin':
      return (
        hasTokenOrHat(process.env.NEXT_PUBLIC_MARKET_ADMIN) ||
        hasTokenOrHat(process.env.NEXT_PUBLIC_MARKET_MANAGEMENT)
      );
    case 'self':
      return hasTokenOrHat(process.env.NEXT_PUBLIC_SELF_TOKEN);
    case 'system':
      return hasTokenOrHat(process.env.NEXT_PUBLIC_SYSTEM_TOKEN);
    default:
      // Direct token/hat check for database token IDs and legacy support
      return (
        userIdentity.userTokens.includes(normalizedRequired) ||
        userIdentity.userHats.includes(normalizedRequired) ||
        hasTokenOrHat(requiredToken)
      );
  }
};

/**
 * Async version of product access check that can resolve pod roles
 */
export const canUserAccessProductAsync = async (
  product: IProduct,
  userIdentity: UserIdentity,
): Promise<boolean> => {
  const requiredToken = product.required_token || product.requiredToken;

  if (!requiredToken) {
    return true; // No token requirement
  }

  // Check for pod role gating first
  if (requiredToken.startsWith('pod_')) {
    console.log(`🛒 Async checking pod role gating: ${requiredToken}`);

    // Extract pod ID from required token format: pod_${podId}_${roleName}
    const parts = requiredToken.split('_');
    if (parts.length >= 2) {
      const podId = parts[1];

      // Fetch all roles for this pod
      const { data: podRoles, error } = await supabase
        .from('pod_permission_lookup')
        .select('hat_id, role_name')
        .eq('pod_id', podId)
        .eq('is_active', true);

      if (!error && podRoles && podRoles.length > 0) {
        // Check if user has ANY role in this pod (leader or member)
        // Pod leaders should see all products gated to their pod
        const hasAnyPodRole = podRoles.some((role) =>
          userIdentity.userHats.includes(role.hat_id.toLowerCase())
        );

        if (hasAnyPodRole) {
          console.log(
            `🛒 User has access to pod ${podId} (member or leader)`,
          );
          return true;
        }

        console.log(
          `🛒 User does not have any role in pod ${podId}`,
        );
        return false;
      }
    }

    // Fallback: Resolve the pod role ID to actual hat ID (exact match)
    const hatId = await resolvePodRoleToHatId(requiredToken);
    if (!hatId) {
      console.log(`🛒 Could not resolve pod role ${requiredToken}`);
      return false;
    }

    // Check if user has this specific hat
    const hasHat = userIdentity.userHats.includes(hatId.toLowerCase());
    console.log(
      `🛒 User ${hasHat ? 'has' : 'does not have'} required hat ${hatId}`,
    );
    return hasHat;
  }

  // Fall back to synchronous check for other token types
  return canUserAccessProduct(product, userIdentity);
};

/**
 * Filter products array to only include those accessible by the user
 */
export const filterAccessibleProducts = (
  products: IProduct[],
  userIdentity: UserIdentity | null,
): IProduct[] => {
  if (!userIdentity) {
    // Return only products with no token requirements if user not authenticated
    return products.filter(
      (product) => !product.required_token && !product.requiredToken,
    );
  }

  return products.filter((product) =>
    canUserAccessProduct(product, userIdentity),
  );
};

/**
 * Async version of filter that can handle pod role gating
 */
export const filterAccessibleProductsAsync = async (
  products: IProduct[],
  userIdentity: UserIdentity | null,
): Promise<IProduct[]> => {
  if (!userIdentity) {
    // Return only products with no token requirements if user not authenticated
    return products.filter(
      (product) => !product.required_token && !product.requiredToken,
    );
  }

  // Check each product individually with async support
  const accessibilityChecks = await Promise.all(
    products.map(async (product) => {
      const canAccess = await canUserAccessProductAsync(product, userIdentity);
      return { product, canAccess };
    }),
  );

  return accessibilityChecks
    .filter((result) => result.canAccess)
    .map((result) => result.product);
};

/**
 * Get accessible products for a user address
 * Integrates with the centralized identity system
 */
export const getAccessibleProductsForUser = async (
  products: IProduct[],
  userAddress: string,
  tokenBalances?: any,
  userHats?: string[],
): Promise<IProduct[]> => {
  try {
    const userIdentity = await getUserIdentity(
      userAddress,
      tokenBalances,
      userHats,
    );
    console.log(
      `🛒 Using async product filtering with ${userIdentity.userHats.length} hats`,
    );
    return await filterAccessibleProductsAsync(products, userIdentity);
  } catch (error) {
    console.error('🛒 Error getting accessible products:', error);
    // Return only products with no requirements on error
    return products.filter(
      (product) => !product.required_token && !product.requiredToken,
    );
  }
};

/**
 * Sort products based on different criteria
 */
export const sortProducts = (
  products: IProduct[],
  sortOption: string,
): IProduct[] => {
  const sorted = [...products];

  switch (sortOption) {
    case 'priceLowHigh':
      return sorted.sort((a, b) => {
        const priceA = Math.min(
          a.price_self || a.price || Number.POSITIVE_INFINITY,
          a.price_system || a.price || Number.POSITIVE_INFINITY,
        );
        const priceB = Math.min(
          b.price_self || b.price || Number.POSITIVE_INFINITY,
          b.price_system || b.price || Number.POSITIVE_INFINITY,
        );
        return priceA - priceB;
      });

    case 'priceHighLow':
      return sorted.sort((a, b) => {
        const priceA = Math.max(
          a.price_self || a.price || 0,
          a.price_system || a.price || 0,
        );
        const priceB = Math.max(
          b.price_self || b.price || 0,
          b.price_system || b.price || 0,
        );
        return priceB - priceA;
      });

    case 'token':
      return sorted.sort((a, b) => {
        const tokenA = a.required_token || a.requiredToken || 'no_token';
        const tokenB = b.required_token || b.requiredToken || 'no_token';
        return tokenA.localeCompare(tokenB);
      });

    default:
      return sorted;
  }
};

/**
 * Get product pricing based on user's available tokens
 */
export const getProductPricing = (
  product: IProduct,
  userIdentity: UserIdentity,
): {
  price: number;
  currency: string;
  paymentMethod: 'self' | 'system' | 'default';
} => {
  // Helper to check if user has a specific token
  const hasToken = (envVar: string | undefined): boolean => {
    if (!envVar) return false;
    return (
      userIdentity.userTokens.includes(envVar.toLowerCase()) ||
      userIdentity.userHats.includes(envVar.toLowerCase())
    );
  };

  // Check if user can pay with self token
  if (product.price_self && hasToken(process.env.NEXT_PUBLIC_SELF_TOKEN)) {
    return {
      price: product.price_self,
      currency: 'SELF',
      paymentMethod: 'self',
    };
  }

  // Check if user can pay with system token
  if (product.price_system && hasToken(process.env.NEXT_PUBLIC_SYSTEM_TOKEN)) {
    return {
      price: product.price_system,
      currency: 'SYSTEM',
      paymentMethod: 'system',
    };
  }

  // Fallback to default pricing
  return {
    price: product.price || 0,
    currency: product.currencyId || 'USD',
    paymentMethod: 'default',
  };
};

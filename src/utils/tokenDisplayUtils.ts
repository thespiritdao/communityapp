import { supabase } from '@/lib/supabase';

export interface TokenDisplayInfo {
  id: string;
  displayName: string;
  type: 'token' | 'pod_role' | 'system';
  podName?: string;
  roleName?: string;
}

/**
 * Cache for token display names to avoid repeated database calls
 */
const tokenDisplayCache = new Map<string, TokenDisplayInfo>();

/**
 * Resolve a token requirement ID to a human-readable display name
 */
export const resolveTokenDisplayName = async (
  tokenId: string,
): Promise<TokenDisplayInfo> => {
  // Check cache first
  if (tokenDisplayCache.has(tokenId)) {
    return tokenDisplayCache.get(tokenId)!;
  }

  try {
    // Handle system tokens first
    if (tokenId === 'system' || tokenId === 'self') {
      const displayInfo: TokenDisplayInfo = {
        id: tokenId,
        displayName: tokenId === 'system' ? '$SYSTEM Token' : '$SELF Token',
        type: 'system',
      };
      tokenDisplayCache.set(tokenId, displayInfo);
      return displayInfo;
    }

    // Check if it's a simple token ID in the tokens table
    const { data: tokenData, error: tokenError } = await supabase
      .from('tokens')
      .select('id, name, symbol, contract_address')
      .eq('id', tokenId)
      .single();

    if (tokenData && !tokenError) {
      const displayInfo: TokenDisplayInfo = {
        id: tokenId,
        displayName: tokenData.symbol
          ? `${tokenData.name} (${tokenData.symbol})`
          : tokenData.name,
        type: 'token',
      };
      tokenDisplayCache.set(tokenId, displayInfo);
      return displayInfo;
    }

    // Check if it's a structured pod role permission ID (format: pod_{uuid}_{role_name})
    const podRoleMatch = tokenId.match(/^pod_([a-f0-9\-]+)_(.+)$/);
    if (podRoleMatch) {
      const [, podId, encodedRoleName] = podRoleMatch;
      const roleName = encodedRoleName.replace(/_/g, ' ');

      // Query the pod_role_permissions table for this pod and role
      const { data: podRoleData, error: podRoleError } = await supabase
        .from('pod_role_permissions')
        .select(`
          pod_id,
          role_name,
          permissions,
          is_active,
          pods!inner(name)
        `)
        .eq('pod_id', podId)
        .ilike('role_name', roleName)
        .eq('is_active', true)
        .single();

      if (podRoleData && !podRoleError) {
        const podName = (podRoleData.pods as any).name;
        const displayInfo: TokenDisplayInfo = {
          id: tokenId,
          displayName: `${podRoleData.role_name} in ${podName}`,
          type: 'pod_role',
          podName: podName,
          roleName: podRoleData.role_name,
        };
        tokenDisplayCache.set(tokenId, displayInfo);
        return displayInfo;
      } else {
        console.warn(`Could not find pod role for ID: ${tokenId}`, {
          podId,
          roleName,
          error: podRoleError,
        });
      }
    }

    // Fallback: Check if it's a simple ID in the pod_permission_lookup table (legacy)
    const { data: legacyPodRoleData, error: legacyPodRoleError } =
      await supabase
        .from('pod_permission_lookup')
        .select(`
        pod_id,
        role_name,
        permissions,
        pods!inner(name)
      `)
        .eq('id', tokenId)
        .eq('is_active', true)
        .single();

    if (legacyPodRoleData && !legacyPodRoleError) {
      const podName = (legacyPodRoleData.pods as any).name;
      const displayInfo: TokenDisplayInfo = {
        id: tokenId,
        displayName: `${podName} - ${legacyPodRoleData.role_name}`,
        type: 'pod_role',
        podName: podName,
        roleName: legacyPodRoleData.role_name,
      };
      tokenDisplayCache.set(tokenId, displayInfo);
      return displayInfo;
    }

    // Check for legacy simple token names (dev, exec, etc.)
    const legacyTokenNames: Record<string, string> = {
      dev: 'Development Pod Access',
      exec: 'Executive Pod Access',
      marketing: 'Marketing Pod Access',
      community: 'Community Pod Access',
    };

    if (legacyTokenNames[tokenId]) {
      const displayInfo: TokenDisplayInfo = {
        id: tokenId,
        displayName: legacyTokenNames[tokenId],
        type: 'token',
      };
      tokenDisplayCache.set(tokenId, displayInfo);
      return displayInfo;
    }

    // Fallback - return the raw ID with a note
    console.warn(`Could not resolve display name for token ID: ${tokenId}`);
    const fallbackInfo: TokenDisplayInfo = {
      id: tokenId,
      displayName: `${tokenId} (Token ID)`,
      type: 'token',
    };
    tokenDisplayCache.set(tokenId, fallbackInfo);
    return fallbackInfo;
  } catch (error) {
    console.error('Error resolving token display name:', error);

    // Fallback on error
    const fallbackInfo: TokenDisplayInfo = {
      id: tokenId,
      displayName: `${tokenId} (Unknown)`,
      type: 'token',
    };
    tokenDisplayCache.set(tokenId, fallbackInfo);
    return fallbackInfo;
  }
};

/**
 * Batch resolve multiple token IDs at once (more efficient)
 */
export const resolveMultipleTokenDisplayNames = async (
  tokenIds: string[],
): Promise<TokenDisplayInfo[]> => {
  const results = await Promise.all(
    tokenIds.map((tokenId) => resolveTokenDisplayName(tokenId)),
  );
  return results;
};

/**
 * Clear the display name cache (useful for testing or when tokens are updated)
 */
export const clearTokenDisplayCache = () => {
  tokenDisplayCache.clear();
};

/**
 * Get display info for "no token required" products
 */
export const getNoTokenRequiredDisplayInfo = (): TokenDisplayInfo => {
  return {
    id: '',
    displayName: 'Open to Everyone',
    type: 'system',
  };
};

/**
 * Component-friendly hook-like function to resolve token display name
 * Returns loading state and resolved name
 */
export const useTokenDisplayName = async (tokenId?: string) => {
  if (!tokenId || tokenId === '') {
    return {
      loading: false,
      displayInfo: getNoTokenRequiredDisplayInfo(),
    };
  }

  try {
    const displayInfo = await resolveTokenDisplayName(tokenId);
    return {
      loading: false,
      displayInfo,
    };
  } catch (error) {
    console.error('Error in useTokenDisplayName:', error);
    return {
      loading: false,
      displayInfo: {
        id: tokenId,
        displayName: `${tokenId} (Error)`,
        type: 'token' as const,
      },
    };
  }
};

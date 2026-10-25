/**
 * Service for loading tokens from database tables instead of hardcoded configs
 * Integrates tokens, pods, and pod_role_permissions tables
 */

import { supabase } from '@/utils/supabaseClient';

export interface DatabaseToken {
  id: string;
  name: string;
  description: string;
  contract_address: string;
  token_type: 'erc20' | 'erc721' | 'erc1155';
  token_image: string;
  category: 'membership' | 'credential' | 'accreditation';
  token_address?: string; // ERC-1155 token ID (formerly hat_id)
  is_active: boolean;
  source: 'tokens' | 'pods' | 'pod_roles' | 'event_tokens' | 'accreditations';
  role_name?: string; // For pod_role_permissions tokens
}

/** Sources whose rows are per-member records: presence is ownership, no chain read. */
export const OFFCHAIN_TOKEN_SOURCES: ReadonlySet<DatabaseToken['source']> = new Set([
  'event_tokens',
  'accreditations',
]);

export class DatabaseTokenService {
  /**
   * Get all tokens from the tokens table
   */
  static async getTokensTableData(): Promise<DatabaseToken[]> {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('is_active', true);

      if (error) {
        return [];
      }

      return (data || [])
        // erc20s (e.g. $SELF/$SYSTEM and community tokens like $TGN) are fungible
        // balances, not credentials — they render in the Balances section, not the
        // credential gallery. Only NFT/hat-style tokens belong here.
        .filter((token) => token.token_type !== 'erc20')
        .map((token) => ({
          id: token.id,
          name: token.name,
          description: token.description,
          contract_address: token.contract_address,
          token_type: token.token_type as 'erc20' | 'erc721' | 'erc1155',
          token_image: token.token_image,
          // Respect a per-token `category` column when present; default to
          // 'membership' for backward-compat. Lets specific tokens (e.g.
          // Advocate) be re-homed to 'accreditation' via a DB update with no
          // code change. Tenure (the $SELF prestige band) is computed on-chain
          // and is NOT a tokens-table row, so it never appears here.
          category:
            (token.category as 'membership' | 'credential' | 'accreditation') ||
            'membership',
          token_address: token.token_id, // Use token_id from database as token_address for contract calls
          is_active: token.is_active,
          source: 'tokens',
        }));
    } catch (error) {
      return [];
    }
  }

  /**
   * Get pod leader HAT tokens from pods table
   */
  static async getPodLeaderTokens(): Promise<DatabaseToken[]> {
    try {
      const { data, error } = await supabase
        .from('pods')
        .select('*')
        .eq('is_active', true)
        .not('management_hat_id', 'is', null);

      if (error) {
        return [];
      }

      return (data || []).map((pod) => {
        // Handle pods with IPFS URLs as names
        const podName = pod.name.startsWith('ipfs://')
          ? 'Community Pod'
          : pod.name;

        return {
          id: `pod_leader_${pod.id}`,
          name: `${podName} Leader`,
          description: `Leadership role for ${podName}`,
          contract_address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137', // Hats Protocol
          token_type: 'erc1155' as const,
          token_image: pod.pod_image_url,
          category: 'credential' as const,
          token_address: pod.management_hat_id,
          is_active: pod.is_active,
          source: 'pods',
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get pod member HAT tokens from pods table
   */
  static async getPodMemberTokens(): Promise<DatabaseToken[]> {
    try {
      const { data, error } = await supabase
        .from('pods')
        .select('*')
        .eq('is_active', true)
        .not('membership_hat_id', 'is', null)
        .neq('membership_hat_id', 'pending_creation');

      if (error) {
        return [];
      }

      return (data || []).map((pod) => {
        // Handle pods with IPFS URLs as names
        const podName = pod.name.startsWith('ipfs://')
          ? 'Community Pod'
          : pod.name;

        return {
          id: `pod_member_${pod.id}`,
          name: `${podName} Member`,
          description: `Member role for ${podName}`,
          contract_address: '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137', // Hats Protocol
          token_type: 'erc1155' as const,
          token_image: pod.pod_image_url,
          category: 'credential' as const,
          token_address: pod.membership_hat_id,
          is_active: pod.is_active,
          source: 'pods',
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get role-specific permissions from pod_role_permissions table
   * This table tracks individual member assignments by token_address
   */
  static async getPodRolePermissions(): Promise<DatabaseToken[]> {
    try {
      const { data, error } = await supabase
        .from('pod_role_permissions')
        .select(`
          id,
          pod_id,
          token_address,
          role_name,
          permissions,
          is_active,
          contract_address,
          pods!inner(
            id,
            name,
            pod_image_url,
            is_active
          )
        `)
        .eq('is_active', true);

      if (error) {
        return [];
      }

      return (data || []).map((rolePermission) => {
        // Handle pods with IPFS URLs as names
        const pod = Array.isArray(rolePermission.pods) ? rolePermission.pods[0] : rolePermission.pods;
        const podName = pod?.name?.startsWith('ipfs://')
          ? 'Community Pod' // Default name for IPFS-named pods
          : pod?.name || 'Unknown Pod';

        // Qualify generic role names with the pod. Some pods store bare roles
        // ("Member", "Pod Leader") while others store prefixed ones
        // ("Temporal Naturalism Member"). Prefix the pod name only when it isn't
        // already present, so we never double-prefix.
        const rawRole = rolePermission.role_name || 'Member';
        const qualifiedRole = rawRole.toLowerCase().includes(podName.toLowerCase())
          ? rawRole
          : `${podName} ${rawRole.replace(/^pod\s+/i, '')}`;

        return {
          id: `role_${rolePermission.id}`,
          name: qualifiedRole,
          description: `${qualifiedRole} role in ${podName}`,
          contract_address:
            rolePermission.contract_address ||
            '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
          token_type: 'erc1155' as const,
          token_image: pod?.pod_image_url || '',
          category: 'credential' as const,
          token_address: rolePermission.token_address,
          is_active: rolePermission.is_active,
          source: 'pod_roles',
          role_name: qualifiedRole, // Displayed by DatabaseTokenGallery
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get event completion NFTs (accreditations) for a specific user from event_tokens table
   */
  static async getEventAccreditations(userAddress: string): Promise<DatabaseToken[]> {
    try {
      const { data, error } = await supabase
        .from('event_tokens')
        .select(`
          id,
          event_id,
          contract_address,
          token_id,
          token_name,
          token_description,
          token_image_url,
          token_metadata,
          owner_address,
          events!inner(
            id,
            title,
            event_image_url
          )
        `)
        .eq('token_type', 'completion')
        .eq('owner_address', userAddress.toLowerCase());

      if (error) {
        return [];
      }

      return (data || []).map((row) => {
        const event = Array.isArray(row.events) ? row.events[0] : row.events;
        const title = row.token_name || event?.title || 'Event Accreditation';
        const image = row.token_image_url || event?.event_image_url || '';

        return {
          id: row.id,
          name: title,
          description: row.token_description || `Accreditation for attending ${title}`,
          contract_address: row.contract_address || '',
          token_type: 'erc721' as const,
          token_image: image,
          category: 'accreditation' as const,
          token_address: row.token_id,
          is_active: true,
          source: 'event_tokens' as const,
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Course accreditations (migration 20261025000003): issued by a pod when a
   * member completes every item of a course category. Per-member rows, so
   * presence is ownership.
   */
  static async getCourseAccreditations(userAddress: string): Promise<DatabaseToken[]> {
    try {
      const { data, error } = await supabase
        .from('accreditations')
        .select('id, pod_id, course_category_id, name, description, image_url, issued_at, pods(name)')
        .eq('wallet_address', userAddress.toLowerCase())
        .is('revoked_at', null)
        .order('issued_at', { ascending: false });

      if (error) {
        return [];
      }

      return (data || []).map((row) => {
        const pod = Array.isArray(row.pods) ? row.pods[0] : row.pods;
        const podName = (pod as { name?: string } | null)?.name;
        return {
          id: `accreditation_${row.id}`,
          name: row.name,
          description: row.description || (podName ? `Issued by ${podName}` : 'Course accreditation'),
          contract_address: '',
          token_type: 'erc721' as const,
          token_image: row.image_url || '/images/symbolobinfin.png',
          category: 'accreditation' as const,
          token_address: row.course_category_id || row.id,
          is_active: true,
          source: 'accreditations' as const,
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get all tokens for a user from all sources
   * Note: For pod role permissions, we get all available roles since
   * ownership is determined by on-chain HAT balance checks
   */
  static async getAllTokensForUser(
    userAddress: string,
    category?: 'membership' | 'credential' | 'accreditation',
  ): Promise<DatabaseToken[]> {
    try {
      const [
        tokensTableData,
        podLeaderTokens,
        rolePermissions,
        eventAccreditations,
        courseAccreditations,
      ] = await Promise.all([
        this.getTokensTableData(),
        this.getPodLeaderTokens(),
        this.getPodRolePermissions(),
        this.getEventAccreditations(userAddress),
        this.getCourseAccreditations(userAddress),
      ]);

      // Pods that have pod_role_permissions entries are fully covered by rolePermissions.
      // Only include podLeaderTokens for pods that have NO role permission entries (e.g. Executive Pod).
      const podIdsWithRolePermissions = new Set(
        rolePermissions.map((r) => {
          // role id format is `role_${uuid}` — extract pod_id via the token_address match
          // Instead, track by token_address since that's what both sources share
          return r.token_address;
        }),
      );
      const fallbackLeaderTokens = podLeaderTokens.filter(
        (t) => !podIdsWithRolePermissions.has(t.token_address),
      );

      const allTokens = [
        ...tokensTableData,
        ...fallbackLeaderTokens,
        ...rolePermissions,
        ...eventAccreditations,
        ...courseAccreditations,
      ];

      // Filter by category if specified
      const filteredTokens = category
        ? allTokens.filter((token) => token.category === category)
        : allTokens;

      // Remove duplicates based on contract_address + token_address + name combination
      // This ensures different tokens with same contract but different IDs are kept
      const uniqueTokens = filteredTokens.reduce((acc, token) => {
        const key = `${token.contract_address}_${token.token_address || token.name}_${token.source}`;
        if (!acc.has(key)) {
          acc.set(key, token);
        }
        return acc;
      }, new Map<string, DatabaseToken>());

      return Array.from(uniqueTokens.values());
    } catch (error) {
      return [];
    }
  }

  /**
   * Convert database token to TokenGallery format
   */
  static convertToTokenConfig(dbToken: DatabaseToken) {
    return {
      address: dbToken.contract_address,
      tokenId: dbToken.token_address,
      type: dbToken.token_type,
      label: dbToken.name,
      category: dbToken.category,
      image: dbToken.token_image,
      source: dbToken.source,
    };
  }

  /**
   * Get token statistics for debugging
   */
  static async getTokenStats(): Promise<{
    tokensTable: number;
    podLeaders: number;
    podMembers: number;
    activeRoles: number;
  }> {
    try {
      const [tokens, podLeaders, podMembers] = await Promise.all([
        this.getTokensTableData(),
        this.getPodLeaderTokens(),
        this.getPodMemberTokens(),
      ]);

      const { count: roleCount } = await supabase
        .from('pod_role_permissions')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      return {
        tokensTable: tokens.length,
        podLeaders: podLeaders.length,
        podMembers: podMembers.length,
        activeRoles: roleCount || 0,
      };
    } catch (error) {
      return { tokensTable: 0, podLeaders: 0, podMembers: 0, activeRoles: 0 };
    }
  }
}

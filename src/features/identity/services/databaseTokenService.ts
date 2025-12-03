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
  category: 'membership' | 'credential';
  token_address?: string; // ERC-1155 token ID (formerly hat_id)
  is_active: boolean;
  source: 'tokens' | 'pods' | 'pod_roles';
  role_name?: string; // For pod_role_permissions tokens
}

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

      return (data || []).map((token) => ({
        id: token.id,
        name: token.name,
        description: token.description,
        contract_address: token.contract_address,
        token_type: token.token_type as 'erc20' | 'erc721' | 'erc1155',
        token_image: token.token_image,
        category: token.token_type === 'erc20' ? 'credential' : 'membership',
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

        const displayName = rolePermission.role_name || `${podName} Member`;

        return {
          id: `role_${rolePermission.id}`,
          name: displayName,
          description: `${rolePermission.role_name || 'Member'} role in ${podName}`,
          contract_address:
            rolePermission.contract_address ||
            '0x3bc1A0Ad72417f2d411118085256fC53CBdDd137',
          token_type: 'erc1155' as const,
          token_image: pod?.pod_image_url || '',
          category: 'credential' as const,
          token_address: rolePermission.token_address,
          is_active: rolePermission.is_active,
          source: 'pod_roles',
          role_name: rolePermission.role_name, // Add role_name as separate field
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
    category?: 'membership' | 'credential',
  ): Promise<DatabaseToken[]> {
    try {
      const [
        tokensTableData,
        podLeaderTokens,
        podMemberTokens,
        rolePermissions,
      ] = await Promise.all([
        this.getTokensTableData(),
        this.getPodLeaderTokens(),
        this.getPodMemberTokens(),
        this.getPodRolePermissions(),
      ]);

      const allTokens = [
        ...tokensTableData,
        ...podLeaderTokens,
        ...podMemberTokens,
        ...rolePermissions,
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

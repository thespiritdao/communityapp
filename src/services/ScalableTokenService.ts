// src/services/ScalableTokenService.ts
'use client';

import { supabase } from '@/lib/supabase';
import { useAccount, usePublicClient } from 'wagmi';

// Standard ERC721/1155 ABI functions for token balance checking
const TOKEN_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
];

const HATS_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      { name: '_wearer', type: 'address' },
      { name: '_hatId', type: 'uint256' },
    ],
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
  },
];

export interface TokenInfo {
  id: string;
  name: string;
  symbol?: string;
  contract_address?: string;
  token_type: 'erc721' | 'erc1155' | 'hat' | 'system';
  token_id?: string;
  is_active: boolean;
  description?: string;
}

export interface TokenBalance {
  tokenInfo: TokenInfo;
  balance: bigint;
  hasToken: boolean;
  error?: string;
}

/**
 * Scalable Token Service - Database-driven token checking
 * Uses Supabase tokens table for dynamic token management
 */
export class ScalableTokenService {
  /**
   * Get all active tokens from database
   */
  static async getAllActiveTokens(): Promise<TokenInfo[]> {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        console.error('❌ Error fetching tokens:', error);
        throw error;
      }

      console.log(`🎫 Found ${data?.length || 0} active tokens in database`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to fetch active tokens:', error);
      throw error;
    }
  }

  /**
   * Get specific token by ID or name
   */
  static async getToken(identifier: string): Promise<TokenInfo | null> {
    try {
      // Try by ID first
      let { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('id', identifier)
        .eq('is_active', true)
        .single();

      // If not found by ID, try by name (case-insensitive)
      if (error || !data) {
        const { data: nameData, error: nameError } = await supabase
          .from('tokens')
          .select('*')
          .ilike('name', identifier)
          .eq('is_active', true)
          .single();

        if (nameError || !nameData) {
          console.log(`🔍 Token not found: ${identifier}`);
          return null;
        }
        data = nameData;
      }

      console.log(`✅ Found token: ${data.name} (${data.id})`);
      return data;
    } catch (error) {
      console.error('❌ Error fetching token:', error);
      return null;
    }
  }

  /**
   * Check user's balance for a specific token
   */
  static async checkTokenBalance(
    userAddress: string,
    tokenInfo: TokenInfo,
    publicClient: any,
  ): Promise<TokenBalance> {
    const result: TokenBalance = {
      tokenInfo,
      balance: 0n,
      hasToken: false,
    };

    try {
      if (!userAddress || !publicClient) {
        result.error = 'Missing user address or client';
        return result;
      }

      // Handle system tokens
      if (tokenInfo.token_type === 'system') {
        if (tokenInfo.id === 'system' || tokenInfo.id === 'self') {
          result.balance = 1n;
          result.hasToken = true;
          console.log(`✅ System token ${tokenInfo.name}: granted`);
        }
        return result;
      }

      // Handle HAT tokens
      if (tokenInfo.token_type === 'hat' && tokenInfo.contract_address) {
        const hatsContract = process.env
          .NEXT_PUBLIC_HATS_CONTRACT as `0x${string}`;
        if (!hatsContract) {
          result.error = 'HATS contract not configured';
          return result;
        }

        const balance = await publicClient.readContract({
          address: hatsContract,
          abi: HATS_ABI,
          functionName: 'balanceOf',
          args: [
            userAddress as `0x${string}`,
            tokenInfo.contract_address as `0x${string}`,
          ],
        });

        result.balance = balance as bigint;
        result.hasToken = Number(balance) > 0;
        console.log(
          `🎩 HAT token ${tokenInfo.name}: ${result.hasToken ? 'HELD' : 'NOT HELD'} (balance: ${balance})`,
        );
        return result;
      }

      // Handle ERC721/ERC1155 tokens
      if (
        (tokenInfo.token_type === 'erc721' ||
          tokenInfo.token_type === 'erc1155') &&
        tokenInfo.contract_address
      ) {
        let balance: bigint;

        if (tokenInfo.token_type === 'erc1155' && tokenInfo.token_id) {
          // ERC1155 - requires token ID
          balance = await publicClient.readContract({
            address: tokenInfo.contract_address as `0x${string}`,
            abi: TOKEN_ABI,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`, BigInt(tokenInfo.token_id)],
          });
        } else {
          // ERC721 - just owner balance
          balance = await publicClient.readContract({
            address: tokenInfo.contract_address as `0x${string}`,
            abi: TOKEN_ABI,
            functionName: 'balanceOf',
            args: [userAddress as `0x${string}`],
          });
        }

        result.balance = balance as bigint;
        result.hasToken = Number(balance) > 0;
        console.log(
          `🪙 ${tokenInfo.token_type.toUpperCase()} token ${tokenInfo.name}: ${result.hasToken ? 'HELD' : 'NOT HELD'} (balance: ${balance})`,
        );
        return result;
      }

      result.error = `Unsupported token type: ${tokenInfo.token_type}`;
      return result;
    } catch (error) {
      console.error(`❌ Error checking token ${tokenInfo.name}:`, error);
      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Check balances for multiple tokens
   */
  static async checkMultipleTokenBalances(
    userAddress: string,
    tokens: TokenInfo[],
    publicClient: any,
  ): Promise<TokenBalance[]> {
    console.log(`🔍 Checking balances for ${tokens.length} tokens...`);

    const results = await Promise.all(
      tokens.map((token) =>
        this.checkTokenBalance(userAddress, token, publicClient),
      ),
    );

    const held = results.filter((r) => r.hasToken).length;
    console.log(
      `🎫 Token check complete: ${held}/${tokens.length} tokens held`,
    );

    return results;
  }

  /**
   * Check if user has any of the specified tokens (OR logic)
   */
  static async checkTokenRequirement(
    userAddress: string,
    requiredTokenIds: string[],
    publicClient: any,
  ): Promise<{
    hasAccess: boolean;
    heldTokens: TokenBalance[];
    missingTokens: TokenInfo[];
    details: string;
  }> {
    console.log(
      `🔐 Checking token requirement for tokens: ${requiredTokenIds.join(', ')}`,
    );

    try {
      // Get token info for all required tokens
      const tokens: TokenInfo[] = [];
      for (const tokenId of requiredTokenIds) {
        const token = await this.getToken(tokenId);
        if (token) {
          tokens.push(token);
        } else {
          console.warn(`⚠️ Token not found in database: ${tokenId}`);
        }
      }

      if (tokens.length === 0) {
        return {
          hasAccess: false,
          heldTokens: [],
          missingTokens: [],
          details: 'No valid tokens found for requirement',
        };
      }

      // Check balances
      const balances = await this.checkMultipleTokenBalances(
        userAddress,
        tokens,
        publicClient,
      );

      const heldTokens = balances.filter((b) => b.hasToken);
      const missingTokens = balances
        .filter((b) => !b.hasToken)
        .map((b) => b.tokenInfo);

      const hasAccess = heldTokens.length > 0; // OR logic - need at least one

      const details = hasAccess
        ? `Access granted via: ${heldTokens.map((t) => t.tokenInfo.name).join(', ')}`
        : `Missing required tokens: ${missingTokens.map((t) => t.name).join(', ')}`;

      console.log(
        `🎯 Token requirement result: ${hasAccess ? 'GRANTED' : 'DENIED'} - ${details}`,
      );

      return {
        hasAccess,
        heldTokens,
        missingTokens,
        details,
      };
    } catch (error) {
      console.error('❌ Error checking token requirement:', error);
      return {
        hasAccess: false,
        heldTokens: [],
        missingTokens: [],
        details: `Error checking tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Search tokens by name or symbol (for UI autocomplete)
   */
  static async searchTokens(query: string, limit = 10): Promise<TokenInfo[]> {
    try {
      const { data, error } = await supabase
        .from('tokens')
        .select('*')
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,symbol.ilike.%${query}%`)
        .limit(limit)
        .order('name', { ascending: true });

      if (error) {
        console.error('❌ Error searching tokens:', error);
        return [];
      }

      console.log(`🔍 Found ${data?.length || 0} tokens matching "${query}"`);
      return data || [];
    } catch (error) {
      console.error('❌ Failed to search tokens:', error);
      return [];
    }
  }
}

/**
 * React hook for checking user token balances
 */
export const useScalableTokenBalances = () => {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const checkUserTokens = async (
    tokenIds?: string[],
  ): Promise<TokenBalance[]> => {
    if (!address || !publicClient) {
      console.log('🔐 No user address or client available');
      return [];
    }

    try {
      let tokens: TokenInfo[];

      if (tokenIds && tokenIds.length > 0) {
        // Check specific tokens
        tokens = [];
        for (const tokenId of tokenIds) {
          const token = await ScalableTokenService.getToken(tokenId);
          if (token) tokens.push(token);
        }
      } else {
        // Check all active tokens
        tokens = await ScalableTokenService.getAllActiveTokens();
      }

      return await ScalableTokenService.checkMultipleTokenBalances(
        address,
        tokens,
        publicClient,
      );
    } catch (error) {
      console.error('❌ Error in useScalableTokenBalances:', error);
      return [];
    }
  };

  const checkTokenRequirement = async (requiredTokenIds: string[]) => {
    if (!address || !publicClient) {
      return {
        hasAccess: false,
        heldTokens: [],
        missingTokens: [],
        details: 'User not connected',
      };
    }

    return await ScalableTokenService.checkTokenRequirement(
      address,
      requiredTokenIds,
      publicClient,
    );
  };

  return {
    address,
    checkUserTokens,
    checkTokenRequirement,
    isConnected: !!address,
  };
};

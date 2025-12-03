import { EventService } from '../features/events/lib/supabase';

export interface Token {
  id: string;
  name: string;
  symbol?: string;
  address: string;
  decimals?: number;
  isSystemToken?: boolean;
  description?: string;
}

/**
 * Service for managing community currency and membership tokens
 * Note: Pod access is now managed via PodAccessService using HATS Protocol
 */
export class TokenService {
  /**
   * Get all available tokens (community currencies and membership tokens only)
   * Pod access tokens are now managed via the pods table and HATS Protocol
   */
  static async getAllTokens(): Promise<Token[]> {
    try {
      console.log('🪙 Loading community tokens and currencies...');

      // Get tokens from database (should only contain currencies and membership tokens now)
      const databaseTokens = await EventService.getAllTokens();
      console.log('📋 Database tokens:', databaseTokens.length);

      // System tokens from environment (community currencies)
      const systemTokens: Token[] = [
        {
          id: 'system-token',
          name: 'SYSTEM Token',
          symbol: 'SYSTEM',
          address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '',
          decimals: 18,
          isSystemToken: true,
          description: 'SpiritDAO system currency for governance and rewards',
        },
        {
          id: 'self-token',
          name: 'SELF Token',
          symbol: 'SELF',
          address: process.env.NEXT_PUBLIC_SELF_TOKEN || '',
          decimals: 18,
          isSystemToken: true,
          description: 'SpiritDAO community currency for member interactions',
        },
      ].filter((token) => token.address); // Only include if address is configured

      console.log('🏛️ System currency tokens:', systemTokens.length);

      // Convert database tokens to Token interface (membership tokens like Advocate, PoC)
      const convertedDbTokens: Token[] = databaseTokens
        .filter((dbToken) => dbToken.contract_address) // Only include tokens with contract addresses
        .map((dbToken) => ({
          id: dbToken.id,
          name: dbToken.name,
          symbol: dbToken.symbol || undefined,
          address: dbToken.contract_address || '',
          decimals: 18, // Default to 18
          isSystemToken: false,
          description:
            (dbToken as any).description || `Community token: ${dbToken.name}`,
        }));

      // Combine currency tokens and membership tokens
      const allTokens = [...systemTokens, ...convertedDbTokens];

      console.log(
        '✅ Total tokens available (currencies + membership):',
        allTokens.length,
      );
      return allTokens;
    } catch (error) {
      console.error('❌ Failed to load tokens:', error);

      // Fallback to just system tokens if database fails
      const fallbackTokens: Token[] = [
        {
          id: 'system-token',
          name: 'SYSTEM Token',
          symbol: 'SYSTEM',
          address: process.env.NEXT_PUBLIC_SYSTEM_TOKEN || '',
          decimals: 18,
          isSystemToken: true,
          description: 'SpiritDAO system currency',
        },
        {
          id: 'self-token',
          name: 'SELF Token',
          symbol: 'SELF',
          address: process.env.NEXT_PUBLIC_SELF_TOKEN || '',
          decimals: 18,
          isSystemToken: true,
          description: 'SpiritDAO community currency',
        },
      ].filter((token) => token.address);

      console.log(
        '⚠️ Using fallback system tokens only:',
        fallbackTokens.length,
      );
      return fallbackTokens;
    }
  }

  /**
   * Get token by address
   */
  static async getTokenByAddress(address: string): Promise<Token | null> {
    const allTokens = await this.getAllTokens();
    return (
      allTokens.find(
        (token) => token.address.toLowerCase() === address.toLowerCase(),
      ) || null
    );
  }

  /**
   * Get recommended tokens for pod requirements
   */
  static async getRecommendedTokens(): Promise<Token[]> {
    const allTokens = await this.getAllTokens();

    // Prioritize system tokens for pod requirements
    return allTokens.sort((a, b) => {
      if (a.isSystemToken && !b.isSystemToken) return -1;
      if (!a.isSystemToken && b.isSystemToken) return 1;
      return a.name.localeCompare(b.name);
    });
  }
}

export default TokenService;

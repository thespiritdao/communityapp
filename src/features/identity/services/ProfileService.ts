import { supabase } from '@/utils/supabaseClient';
import { sanitizeSearchTerm } from '@/lib/sanitizeSearch';
import type { UserProfile } from '../types';

/**
 * ProfileService - Centralized service for user profile operations
 *
 * Provides clean API for profile data access with proper error handling
 * and consistent return types.
 */
export class ProfileService {
  /**
   * Get a single user profile by wallet address
   */
  static async getByWallet(walletAddress: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*') // Select all fields to match ProfileDisplay requirements
        .eq('wallet_address', walletAddress.toLowerCase())
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 errors

      if (error) {
        console.error('Error fetching profile for', walletAddress, ':', error);
        throw error;
      }

      // maybeSingle() returns null if no rows found, which is expected
      return data;
    } catch (error) {
      console.error('Profile fetch error for', walletAddress, error);
      throw error;
    }
  }

  /**
   * Get multiple user profiles by wallet addresses in a single batch operation
   * Returns a Record mapping wallet address to UserProfile (or undefined if not found)
   */
  static async getManyByWallets(
    walletAddresses: string[],
  ): Promise<Record<string, UserProfile>> {
    if (walletAddresses.length === 0) {
      return {};
    }

    try {
      // Normalize addresses to lowercase for consistent lookup
      const normalizedAddresses = walletAddresses.map((addr) =>
        addr.toLowerCase(),
      );

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*') // Select all fields to match ProfileDisplay requirements
        .in('wallet_address', normalizedAddresses);

      if (error) {
        throw error;
      }

      // Convert array response to Record for easy lookup
      const profileMap: Record<string, UserProfile> = {};

      if (data) {
        data.forEach((profile) => {
          profileMap[profile.wallet_address.toLowerCase()] = profile;
        });
      }

      return profileMap;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get multiple profiles and return both found and missing wallet addresses
   * Useful for debugging or when you need to know which profiles weren't found
   */
  static async getManyByWalletsWithStatus(walletAddresses: string[]): Promise<{
    profiles: Record<string, UserProfile>;
    found: string[];
    missing: string[];
  }> {
    const normalizedAddresses = walletAddresses.map((addr) =>
      addr.toLowerCase(),
    );
    const profiles = await this.getManyByWallets(normalizedAddresses);

    const found = Object.keys(profiles);
    const missing = normalizedAddresses.filter((addr) => !profiles[addr]);

    return {
      profiles,
      found,
      missing,
    };
  }

  /**
   * Create or update a user profile
   */
  static async upsert(
    profile: Omit<UserProfile, 'user_id'> & { user_id?: string },
  ): Promise<UserProfile> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .upsert({
          ...profile,
          wallet_address: profile.wallet_address.toLowerCase(),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Search profiles by name
   */
  static async searchByName(
    searchTerm: string,
    limit = 10,
  ): Promise<UserProfile[]> {
    try {
      const safeTerm = sanitizeSearchTerm(searchTerm);
      if (!safeTerm) return [];
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*') // Select all fields to match ProfileDisplay requirements
        .or(`first_name.ilike.%${safeTerm}%,last_name.ilike.%${safeTerm}%`)
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }
}

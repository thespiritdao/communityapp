/**
 * useForumUserProfiles Hook
 *
 * Efficiently fetches user profiles for multiple wallet addresses in a single query.
 * This prevents N+1 query problems where each PostCard would fetch profiles individually.
 *
 * Features:
 * - Single batch query for all addresses
 * - 5-minute cache with React Query
 * - Returns a map for O(1) lookups
 * - Handles empty address arrays
 *
 * Usage:
 *   const addresses = posts.map(p => p.author_address);
 *   const { data: profileMap } = useForumUserProfiles(addresses);
 *   const profile = profileMap?.[post.author_address];
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/utils/supabaseClient';

export interface UserProfile {
  wallet_address: string;
  profile_picture?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  website?: string | null;
  interests?: string[] | null;
  seeking?: string[] | null;
}

export type UserProfileMap = Record<string, UserProfile>;

export function useForumUserProfiles(addresses: string[]) {
  // Create a stable query key by sorting addresses
  const sortedAddresses = [...new Set(addresses)].sort();

  return useQuery<UserProfileMap>({
    queryKey: ['forum-user-profiles', sortedAddresses],
    queryFn: async () => {
      if (sortedAddresses.length === 0) {
        return {};
      }

      // Fetch all profiles in a single query
      const { data, error } = await supabase
        .from('user_profiles')
        .select(
          'wallet_address, first_name, last_name, profile_picture, bio, website, interests, seeking',
        )
        .in(
          'wallet_address',
          sortedAddresses.map((addr) => addr.toLowerCase()),
        );

      if (error) {
        console.error('Error fetching user profiles:', error);
        throw error;
      }

      // Convert array to map for O(1) lookups
      const profileMap: UserProfileMap = {};
      data?.forEach((profile) => {
        profileMap[profile.wallet_address] = profile;
      });

      return profileMap;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    enabled: sortedAddresses.length > 0,
  });
}

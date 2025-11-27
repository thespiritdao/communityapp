'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueries, type UseQueryResult } from '@tanstack/react-query';
import { ProfileService } from '../services/ProfileService';
import type { UserProfile } from '../types';

interface ProfilesContextType {
  // Individual profile queries
  getProfile: (walletAddress: string) => UseQueryResult<UserProfile | null, Error>;
  
  // Batch profile queries
  getProfiles: (walletAddresses: string[]) => {
    data: Record<string, UserProfile | undefined>;
    isLoading: boolean;
    error: Error | null;
  };
}

const ProfilesContext = createContext<ProfilesContextType | undefined>(undefined);

interface ProfilesProviderProps {
  children: ReactNode;
  staleTime?: number;
  cacheTime?: number;
}

/**
 * ProfilesProvider - Manages profile caching with TanStack Query
 * 
 * Provides optimized profile loading with deduplication, caching,
 * and batch operations for better performance.
 */
export function ProfilesProvider({ 
  children, 
  staleTime = 5 * 60 * 1000, // 5 minutes
  cacheTime = 30 * 60 * 1000  // 30 minutes
}: ProfilesProviderProps) {
  
  // Individual profile query function
  const getProfile = (walletAddress: string): UseQueryResult<UserProfile | null, Error> => {
    return useQuery({
      queryKey: ['profile', walletAddress.toLowerCase()],
      queryFn: () => ProfileService.getByWallet(walletAddress),
      staleTime,
      gcTime: cacheTime,
      retry: 2,
      refetchOnWindowFocus: false,
      enabled: !!walletAddress && walletAddress.length === 42, // Valid Ethereum address
    });
  };

  // Batch profile queries function
  const getProfiles = (walletAddresses: string[]) => {
    // Normalize and deduplicate addresses
    const normalizedAddresses = Array.from(
      new Set(walletAddresses.map(addr => addr.toLowerCase()).filter(addr => addr.length === 42))
    );

    // Use useQueries for parallel fetching with individual caching
    const queries = useQueries({
      queries: normalizedAddresses.map(address => ({
        queryKey: ['profile', address],
        queryFn: () => ProfileService.getByWallet(address),
        staleTime,
        gcTime: cacheTime,
        retry: 2,
        refetchOnWindowFocus: false,
      })),
    });

    // Transform results into a lookup map
    const data: Record<string, UserProfile | undefined> = {};
    let isLoading = false;
    let error: Error | null = null;

    normalizedAddresses.forEach((address, index) => {
      const query = queries[index];
      
      if (query.isLoading) {
        isLoading = true;
      }
      
      if (query.error && !error) {
        error = query.error as Error;
      }
      
      // Store the profile data (undefined if loading/error, null if not found)
      data[address] = query.data === null ? undefined : query.data;
    });

    return {
      data,
      isLoading,
      error,
    };
  };

  const contextValue: ProfilesContextType = {
    getProfile,
    getProfiles,
  };

  return (
    <ProfilesContext.Provider value={contextValue}>
      {children}
    </ProfilesContext.Provider>
  );
}

/**
 * Hook to access the profiles context
 * Throws error if used outside ProfilesProvider
 */
export function useProfilesContext(): ProfilesContextType {
  const context = useContext(ProfilesContext);
  
  if (context === undefined) {
    throw new Error('useProfilesContext must be used within a ProfilesProvider');
  }
  
  return context;
}
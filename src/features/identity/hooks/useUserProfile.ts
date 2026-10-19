// Optimized hook using centralized auth and ProfileService
'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './useAuth';
import { ProfileService } from '../services/ProfileService';

type ProfileData = {
  wallet_address?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  profile_picture?: string | null;
  date_of_birth?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  bio?: string | null;
  interests?: string | null;
  seeking?: string | null;
  open_to_connect?: string | null;
  occupation?: string | null;
  skills_expertise?: string | null;
  workplace_organization?: string | null;
  projects_or_initiatives?: string | null;
  linkedin?: string | null;
  twitter?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  discord?: string | null;
  github?: string | null;
  youtube?: string | null;
  twitch?: string | null;
  website?: string | null;
  onboarding_intent?: 'join' | 'found' | 'explore' | null;
};

export function useUserProfile(walletAddress: string | undefined) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { session, isAuthenticated, signIn, loading: authLoading } = useAuth();
  const lastFetchedAddress = useRef<string | undefined>();
  const isFetching = useRef(false);

  const fetchProfile = useCallback(async () => {
    if (!walletAddress) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Prevent duplicate fetches for same address
    if (lastFetchedAddress.current === walletAddress || isFetching.current) {
      return;
    }

    // Wait for auth to complete
    if (authLoading) {
      return;
    }

    isFetching.current = true;

    try {
      setLoading(true);
      setError(null);

      // Ensure user is authenticated first
      if (!isAuthenticated) {
        await signIn(walletAddress);
      }

      // This hook loads the signed-in user's OWN profile (identity page and
      // edit form need email/phone/address), so read the base table.
      let profileData = await ProfileService.getOwnByWallet(walletAddress);

      if (!profileData && session) {
        // Create new profile using ProfileService
        profileData = await ProfileService.upsert({
          wallet_address: walletAddress.toLowerCase(),
          user_id: session.user.id,
        });
      }

      setProfile(profileData);
      lastFetchedAddress.current = walletAddress;
    } catch (err) {
      setError(err as Error);
      setProfile(null);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [walletAddress, isAuthenticated, authLoading, signIn, session]); // Removed 'profile' dependency

  useEffect(() => {
    if (!authLoading) {
      fetchProfile();
    }
  }, [fetchProfile, authLoading]);

  return {
    profile,
    loading: loading || authLoading,
    error,
    refetch: fetchProfile,
  };
}

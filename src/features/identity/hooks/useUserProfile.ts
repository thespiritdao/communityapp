// src/features/identity/hooks/useUserProfile.ts
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from 'src/utils/supabaseClient';

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
};

export function useUserProfile(walletAddress: string | undefined) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);

  const fetchProfile = useCallback(async () => {
    if (!walletAddress) {
      setProfile(null);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // First, check authentication status
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      console.log('Current session:', session);

      if (sessionError) {
        console.error('Session error:', sessionError);
        throw sessionError;
      }

      // If no session, try to get tokens and create session
      if (!session) {
        console.log('No session found, attempting to create one...');
        try {
          const response = await fetch('/api/auth/onchainkit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ address: walletAddress }),
          });

          if (!response.ok) {
            throw new Error(`Failed to get auth tokens: ${response.statusText}`);
          }

          const { supabaseToken, supabaseRefreshToken } = await response.json();
          
          // Set the session with the tokens
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: supabaseToken,
            refresh_token: supabaseRefreshToken,
          });

          if (setSessionError) {
            throw setSessionError;
          }
        } catch (authError) {
          console.error('Authentication error:', authError);
          throw new Error('Failed to authenticate user');
        }
      }

      // Now fetch or create profile
      const { data: existingProfile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('wallet_address', walletAddress.toLowerCase())
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching profile:', fetchError);
        throw fetchError;
      }

      // Get current session again after potential authentication
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      
      if (!existingProfile && currentSession) {
        console.log('No profile found, creating new profile...');
        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert([
            {
              wallet_address: walletAddress.toLowerCase(),
              user_id: currentSession.user.id,
            }
          ])
          .select()
          .single();

        if (createError) {
          console.error('Error creating profile:', createError);
          throw createError;
        }

        setProfile(newProfile);
      } else if (existingProfile) {
        console.log('Existing profile found:', existingProfile);
        setProfile(existingProfile);
      }

    } catch (err) {
      console.error('Profile fetch/creation error:', err);
      setError(err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, error, refetch: fetchProfile };
}
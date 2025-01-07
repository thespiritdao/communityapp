// src/identity/utils/updateProfile.ts
import { supabase } from './supabaseClient';

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
  identity_verification?: boolean | null;
  recovery_information?: string | null;
  notification_preferences?: string | null;
  badges?: string | null;
  reputation?: number | null;
};

export async function updateProfile(wallet_address: string, updates: ProfileData) {
  // Ensure wallet_address is always included in the upsert
  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({ wallet_address, ...updates })
    .select('*')
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    throw error;
  }

  return data;
}

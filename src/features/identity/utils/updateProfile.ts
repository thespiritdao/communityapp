// src/features/identity/utils/updateProfile.ts
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
  // Normalize the wallet address to ensure consistency.
  const normalizedWallet = wallet_address.toLowerCase();

  // First, fetch the existing profile by wallet_address.
  const { data: existingProfile, error: fetchError } = await supabase
    .from('user_profiles')
    .select('user_id, wallet_address')
    .eq('wallet_address', normalizedWallet)
    .maybeSingle();

  if (fetchError) {
    console.error.error('Error fetching existing profile:', fetchError);
    throw fetchError;
  }

  let payload;
	if (existingProfile) {
	  // Remove wallet_address from the incoming updates to ignore any changes,
	  // but include the existing wallet_address from the profile.
	  const { wallet_address: _ignore, ...restUpdates } = updates;
	  payload = { 
		user_id: existingProfile.user_id, 
		wallet_address: existingProfile.wallet_address, 
		...restUpdates 
	  };
	} else {
	  payload = { wallet_address: normalizedWallet, ...updates };
	}


  // Set the conflict target. Use the primary key (user_id) if profile exists; otherwise, use wallet_address.
  const conflictTarget = existingProfile ? ['user_id'] : ['wallet_address'];

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: conflictTarget })
    .select('*')
    .single();

  if (error) {
    console.error('Error updating profile:', error);
    throw error;
  }

  return data;
}

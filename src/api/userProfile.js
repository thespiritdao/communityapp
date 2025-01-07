import { supabase } from '../utils/supabaseClient';

export async function getUserProfile(walletAddress) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('wallet_address', walletAddress)
    .single();

  if (error) throw error;
  return data;
}

export async function updateUserProfile(walletAddress, updateData) {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('wallet_address', walletAddress);

  if (error) throw error;
  return data;
}

export async function createUserProfile(profileData) {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert([profileData]);

  if (error) throw error;
  return data;
}

// src/utils/createSupabaseSession.ts

import { supabase } from 'src/utils/supabaseClient';

export async function createSupabaseSession(
  supabaseToken: string,
  supabaseRefreshToken: string
) {
  try {
    console.log('Client: Attempting to set Supabase session...');
    // Attempt to set the Supabase session using provided tokens
    const { data, error } = await supabase.auth.setSession({
      access_token: supabaseToken,
      refresh_token: supabaseRefreshToken,
    });

    if (error) {
      console.error('Client: Error setting Supabase session:', error);
      throw error;
    }

    if (!data?.session) {
      console.error('Client: Supabase session data is missing.');
      throw new Error('No session data returned from Supabase');
    }

    console.log('Client: Supabase session set successfully!', data);

    // Return session data for further use
    return data.session;
  } catch (error) {
    console.error('Client: Error creating Supabase session:', error);
    throw error;
  }
}

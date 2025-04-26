// src/utils/createSupabaseSession.ts

import { supabase } from 'src/utils/supabaseClient';

export async function createSupabaseSession(
  supabaseToken: string,
  supabaseRefreshToken: string
) {
  try {
    console.log('Client: Checking Supabase session...');

    // Check if a session already exists
    let { data: session, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Client: Error fetching Supabase session:', error);
    }

    // If session exists but JWT is expired, refresh it
    if (session?.session?.expires_at && session.session.expires_at < Date.now() / 1000) {
      console.warn('Client: Supabase session expired. Refreshing...');
      const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Client: Error refreshing session:', refreshError.message);
        throw refreshError;
      }
      session = refreshedSession;
    }

    if (!session?.session) {
      console.warn('Client: No active Supabase session found. Setting a new one...');
      const { data, error } = await supabase.auth.setSession({
        access_token: supabaseToken,
        refresh_token: supabaseRefreshToken,
      });

      if (error) {
        console.error('Client: Error setting Supabase session:', error);
        throw error;
      }

      if (!data?.session) {
        console.error('Client: No session data returned from Supabase');
        throw new Error('No session data returned from Supabase');
      }

      session = data.session;
    }

    console.log('Client: Supabase session is active:', session);

    return session;
  } catch (error) {
    console.error('Client: Error handling Supabase session:', error);
    throw error;
  }
}

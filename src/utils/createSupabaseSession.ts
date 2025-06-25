// src/utils/createSupabaseSession.ts

import { supabase } from 'src/utils/supabaseClient';

export async function createSupabaseSession(
  supabaseToken: string,
  supabaseRefreshToken: string
) {
  try {
    console.log('Client: Starting Supabase session creation...', {
      hasToken: !!supabaseToken,
      hasRefreshToken: !!supabaseRefreshToken
    });

    // Check if a session already exists
    let { data: session, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Client: Error fetching Supabase session:', error);
      throw error;
    }

    // If session exists but JWT is expired, refresh it
    if (session?.session?.expires_at && session.session.expires_at < Date.now() / 1000) {
      console.warn('Client: Supabase session expired. Refreshing...', {
        expiresAt: new Date(session.session.expires_at * 1000).toISOString(),
        currentTime: new Date().toISOString()
      });
      
      const { data: refreshedSession, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        console.error('Client: Error refreshing session:', refreshError.message);
        throw refreshError;
      }
      session = refreshedSession;
      console.log('Client: Session refreshed successfully');
    }

    if (!session?.session) {
      console.warn('Client: No active Supabase session found. Setting a new one...');
      
      if (!supabaseToken || !supabaseRefreshToken) {
        console.error('Client: Missing tokens for session creation', {
          hasToken: !!supabaseToken,
          hasRefreshToken: !!supabaseRefreshToken
        });
        throw new Error('Missing tokens for session creation');
      }

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

      session = data;
      console.log('Client: New session created successfully');
    }

    console.log('Client: Supabase session is active:', {
      userId: session.session?.user?.id,
      expiresAt: session.session?.expires_at ? new Date(session.session.expires_at * 1000).toISOString() : 'N/A'
    });

    return session;
  } catch (error) {
    console.error('Client: Error handling Supabase session:', error);
    throw error;
  }
}

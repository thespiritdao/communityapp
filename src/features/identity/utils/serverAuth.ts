// Server-side auth utilities for services that can't use React hooks
import { supabase } from '@/utils/supabaseClient';

/**
 * Get current session for server-side operations
 * This is a controlled access point for non-React code
 */
export async function getCurrentSession() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      console.warn('Session retrieval error:', error.message);
      return null;
    }

    return session;
  } catch (error) {
    console.warn('Failed to get current session:', error);
    return null;
  }
}

/**
 * Check if user is authenticated for server-side operations
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getCurrentSession();
  return !!session?.user?.id;
}

/**
 * Get current user ID for server-side operations
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getCurrentSession();
  return session?.user?.id || null;
}

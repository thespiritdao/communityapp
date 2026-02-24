'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';

/**
 * SessionCacheManager - Clears stale cache when session expires
 *
 * Prevents users from seeing cached content with expired sessions
 * by forcing a page reload when the session is no longer valid.
 */
export function SessionCacheManager() {
  const hasChecked = useRef(false);

  useEffect(() => {
    // Only check once on mount
    if (hasChecked.current) return;
    hasChecked.current = true;

    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        // No session or refresh error: do nothing — page.tsx re-authenticates
        // silently via the walletAddress + onboarding check flow. Clearing
        // Supabase storage here actively breaks that recovery path.
        if (error || !session) {
          return;
        }

        // Session exists but is expired: sign out cleanly so the re-auth
        // flow in page.tsx starts from a known-clean state.
        const expiresAt = session.expires_at;
        if (expiresAt && expiresAt < Date.now() / 1000) {
          console.log('🗑️ Session expired, signing out...');
          await supabase.auth.signOut();
        }
      } catch (error) {
        console.error('❌ SessionCacheManager error:', error);
      }
    };

    checkSession();
  }, []);

  // This component doesn't render anything
  return null;
}

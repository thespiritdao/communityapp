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

        // If there's an error getting the session or no session exists
        if (error || !session) {
          console.log('🗑️ No valid session found, clearing cache...');

          // Clear all relevant caches
          localStorage.removeItem('wagmi.store');
          localStorage.removeItem('wagmi.cache');
          localStorage.removeItem('wagmi.recentConnectorId');

          // Clear any Supabase cached data
          const supabaseKeys = Object.keys(localStorage).filter(key =>
            key.startsWith('sb-') || key.startsWith('supabase')
          );
          supabaseKeys.forEach(key => localStorage.removeItem(key));

          console.log('✅ Cache cleared');
          return;
        }

        // Check if session is expired
        const expiresAt = session.expires_at;
        if (expiresAt && expiresAt < Date.now() / 1000) {
          console.log('🗑️ Session expired, clearing cache and reloading...');

          // Sign out to clear session
          await supabase.auth.signOut();

          // Clear caches
          localStorage.removeItem('wagmi.store');
          localStorage.removeItem('wagmi.cache');
          localStorage.removeItem('wagmi.recentConnectorId');

          const supabaseKeys = Object.keys(localStorage).filter(key =>
            key.startsWith('sb-') || key.startsWith('supabase')
          );
          supabaseKeys.forEach(key => localStorage.removeItem(key));

          // Force reload to get fresh state
          window.location.reload();
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

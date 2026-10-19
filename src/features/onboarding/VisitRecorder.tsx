'use client';

/**
 * VisitRecorder — mounted once in providers. Watches the pathname and, the
 * first time a signed-in member opens a tracked route, stores the timestamp
 * in user_profiles.onboarding_visited. This is the only onboarding progress
 * that is stored; everything else is derived from real rows.
 *
 * Writes are own-row updates under RLS. A visit is recorded once per key;
 * the set already stored is loaded once per session so repeat navigation
 * costs nothing.
 */

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { supabase } from '@/utils/supabaseClient';
import { useAuthContext } from '@/features/identity/components/AuthProvider';
import { visitKeyForPath, type VisitKey } from './tracks';
import { ONBOARDING_CHANGED_EVENT } from './useOnboardingProgress';

export function VisitRecorder() {
  const pathname = usePathname();
  const { session } = useAuthContext();
  const userId = session?.user?.id ?? null;

  const known = useRef<Set<VisitKey> | null>(null);
  const loadedFor = useRef<string | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!userId || !pathname) return;
    const key = visitKeyForPath(pathname);
    if (!key) return;

    const run = async () => {
      // Load the stored set once per signed-in user.
      if (loadedFor.current !== userId) {
        const { data, error } = await supabase
          .from('user_profiles')
          .select('onboarding_visited')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) {
          // Column missing (migration not applied) or RLS surprise: stay quiet.
          return;
        }
        known.current = new Set(Object.keys(data?.onboarding_visited ?? {}) as VisitKey[]);
        loadedFor.current = userId;
      }
      if (!known.current || known.current.has(key)) return;

      // Optimistically mark so a fast double navigation doesn't write twice.
      known.current.add(key);

      // Read-merge-write: onboarding_visited is small and only this member
      // writes it, so a lost update is not a real risk.
      const { data: current } = await supabase
        .from('user_profiles')
        .select('onboarding_visited')
        .eq('user_id', userId)
        .maybeSingle();
      const merged = { ...(current?.onboarding_visited ?? {}), [key]: new Date().toISOString() };
      const { error } = await supabase
        .from('user_profiles')
        .update({ onboarding_visited: merged })
        .eq('user_id', userId);
      if (error) {
        known.current.delete(key);
        return;
      }
      window.dispatchEvent(new Event(ONBOARDING_CHANGED_EVENT));
    };

    // Serialise writes so two quick route changes don't race the load.
    inFlight.current = (inFlight.current ?? Promise.resolve()).then(run).catch(() => {});
  }, [pathname, userId]);

  return null;
}

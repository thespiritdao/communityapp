// src/features/identity/components/SessionGuard.tsx
//
// Keeps the Supabase session alive alongside the CDP wallet session, on every
// page — not just the landing page.
//
// The app has two identities: the CDP embedded wallet (which signs
// transactions and makes the UI look signed in) and a Supabase JWT (which
// every authenticated API call and RLS policy depends on). Sign-in used to run
// only in src/app/page.tsx, so if the Supabase session lapsed while the user
// was deep in the app — expiry, storage cleared, a tab that outlived a deploy —
// nothing re-established it. The wallet kept working, on-chain writes
// succeeded, and the follow-up API call failed with a bare 401.
//
// This guard notices "wallet present, no session" anywhere in the app and
// signs in again. It deliberately stays out of the way on '/', where
// page.tsx owns the first-run onboarding sequence.

'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useAuthContext } from './AuthProvider';

export function SessionGuard() {
  const pathname = usePathname();
  const { evmAddress } = useEvmAddress();
  const { isAuthenticated, loading, signIn, linkingRequired } = useAuthContext();
  const attemptedFor = useRef<string | null>(null);

  useEffect(() => {
    // '/' runs its own onboarding + auth sequence; don't race it.
    if (pathname === '/') return;
    if (!evmAddress || loading || isAuthenticated || linkingRequired) return;
    if (attemptedFor.current === evmAddress) return;

    attemptedFor.current = evmAddress;
    console.log('🔐 SessionGuard: wallet present without a session — signing in');
    signIn(evmAddress).catch((err) => {
      console.warn('🔐 SessionGuard: sign-in failed', err);
      // Allow one more try on the next wallet/route change.
      attemptedFor.current = null;
    });
  }, [pathname, evmAddress, isAuthenticated, loading, linkingRequired, signIn]);

  // Clear the latch once a session exists, so a later lapse can be recovered.
  useEffect(() => {
    if (isAuthenticated) attemptedFor.current = null;
  }, [isAuthenticated]);

  return null;
}

export default SessionGuard;

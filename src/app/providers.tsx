// src/app/providers.tsx
'use client';

import React, { type ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { CommunityProvider } from '@/context/CommunityContext';
import { UnifiedNotificationProvider } from '@/context/UnifiedNotificationContext';
import { TokenBalancesProvider } from '@/context/TokenBalancesContext';
import { CDPEmbeddedProvider } from '../wallet/components/CDPEmbeddedProvider';
import { ProfilesProvider } from '@/features/identity/context/ProfilesProvider';
import { AuthProvider } from '@/features/identity';
import { ContractConfigProvider } from '@/providers/ContractConfigProvider';
import MobileBottomNav from '@/components/MobileBottomNav';
import { InstallPrompt } from '@/components/InstallPrompt';
import { SessionCacheManager } from '@/components/SessionCacheManager';
import { IncomingCallBanner } from '@/features/chat/components/IncomingCallBanner';
import { TourManager } from '@/components/tour/TourManager';
import { initHatRegistry } from '@/lib/hatRegistryClient';
import { PresenceTracker } from '@/components/PresenceTracker';

/**
 * Fetches hat IDs from /api/hat-registry on app startup and populates
 * the client-side registry so synchronous lookups work throughout the app.
 */
function HatRegistryInitializer() {
  useEffect(() => {
    fetch('/api/hat-registry')
      .then((r) => r.json())
      .then((ids) => initHatRegistry(ids))
      .catch((err) => console.warn('[HatRegistryInitializer] Failed to load hat IDs:', err));
  }, []);
  return null;
}

// Hide navigation ONLY on loading screen (root page)
const ConditionalBottomNav = React.memo(function ConditionalBottomNav() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted) {
    return null;
  }

  // Hide navigation ONLY on root page (loading screen)
  if (pathname === '/') {
    return null;
  }

  // Show navigation on ALL other pages
  return <MobileBottomNav />;
});

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Client-only providers wrapper.
 *
 * CRITICAL: This component is only mounted ONCE at app startup.
 * It should never remount during navigation - only on hard refresh.
 *
 * This ensures CDP embedded wallet sessions persist across all navigation.
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <ContractConfigProvider>
      <CDPEmbeddedProvider>
        <TokenBalancesProvider>
          <AuthProvider>
            <ProfilesProvider>
              <CommunityProvider>
                <UnifiedNotificationProvider>
                  {/* Load hat IDs from DB into client-side registry */}
                  <HatRegistryInitializer />
                  {/* Session cache manager - clears stale cache on expired sessions */}
                  <SessionCacheManager />
                  {/* Presence heartbeat — upserts wallet + timestamp every 60s */}
                  <PresenceTracker />
                  {/* Global incoming call listener */}
                  <IncomingCallBanner />
                  <TourManager>
                    <main id="page-root" className="min-h-screen">
                      {children}
                    </main>
                    {/* Navigation inside providers so it can access notification context */}
                    <ConditionalBottomNav />
                  </TourManager>
                  {/* PWA Install Prompt */}
                  <InstallPrompt />
                </UnifiedNotificationProvider>
              </CommunityProvider>
            </ProfilesProvider>
          </AuthProvider>
        </TokenBalancesProvider>
      </CDPEmbeddedProvider>
    </ContractConfigProvider>
  );
}

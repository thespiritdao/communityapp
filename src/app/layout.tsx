// src/app/layout.tsx
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
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary';
import { ContractConfigProvider } from '@/providers/ContractConfigProvider';
import MobileBottomNav from '@/components/MobileBottomNav';
import './globals.css';
import '@/styles/index.css';

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

function ChunkErrorFallback({
  error,
  resetErrorBoundary,
}: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Loading Error</h2>
        <p className="text-gray-600 mb-4">
          There was a problem loading the application.
        </p>
        <button
          onClick={resetErrorBoundary}
          className="text-white px-4 py-2 rounded hover:bg-[#254A40]"
          style={{ backgroundColor: '#2F5D50' }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/* Avoid transforms on <html> that can break fixed positioning */}
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ModuleErrorBoundary>
          <ContractConfigProvider>
            <CDPEmbeddedProvider>
              <TokenBalancesProvider>
                <AuthProvider>
                  <ProfilesProvider>
                    <CommunityProvider>
                      <UnifiedNotificationProvider>
                        <main id="page-root" className="min-h-screen">
                          {children}
                        </main>
                        {/* Navigation inside providers so it can access notification context */}
                        <ConditionalBottomNav />
                      </UnifiedNotificationProvider>
                    </CommunityProvider>
                  </ProfilesProvider>
                </AuthProvider>
              </TokenBalancesProvider>
            </CDPEmbeddedProvider>
          </ContractConfigProvider>
        </ModuleErrorBoundary>
      </body>
    </html>
  );
}

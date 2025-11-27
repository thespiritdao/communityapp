// src/app/layout.tsx
'use client';
import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { CommunityProvider } from '../context/CommunityContext';
import { NotificationProvider } from '../context/NotificationContext';
import { GovernanceNotificationProvider } from '../context/GovernanceNotificationContext';
import BottomNav from '../components/BottomNav';
import { TokenBalancesProvider } from '../context/TokenBalancesContext';
import { OnchainProviders } from '../wallet/components/OnchainProviders';
import '@/styles/index.css';

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
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary
          FallbackComponent={ChunkErrorFallback}
          onError={(error, errorInfo) => {
            console.error('Chunk loading error:', error, errorInfo);
            // Check if it's a chunk loading error and attempt to reload
            if (
              error.name === 'ChunkLoadError' ||
              error.message.includes('Loading chunk')
            ) {
              console.log(
                'Detected chunk loading error, attempting to reload...',
              );
              window.location.reload();
            }
          }}
          onReset={() => {
            window.location.reload();
          }}
        >
          <OnchainProviders>
            <TokenBalancesProvider>
              <CommunityProvider>
                <NotificationProvider>
                  <GovernanceNotificationProvider>
                    <div className="relative min-h-screen">
                      {children}
                      <BottomNav />
                    </div>
                  </GovernanceNotificationProvider>
                </NotificationProvider>
              </CommunityProvider>
            </TokenBalancesProvider>
          </OnchainProviders>
        </ErrorBoundary>
      </body>
    </html>
  );
}

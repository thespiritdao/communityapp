// src/app/layout.tsx
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary';
import { PWAManager } from '@/components/PWAManager';
import './globals.css';
import '@/styles/index.css';
import 'react-day-picker/dist/style.css';
import 'react-datepicker/dist/react-datepicker.css';

/**
 * Root layout - SERVER COMPONENT.
 *
 * CRITICAL: This layout must be a server component to prevent
 * provider remounting on every navigation. All client-side providers
 * are moved to ./providers.tsx which is a client component.
 *
 * This ensures CDP embedded wallet sessions persist across all navigation.
 */

// PWA Metadata
export const metadata: Metadata = {
  title: 'SpiritDAO Community',
  description: 'Decentralized community platform for coordination and governance',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SpiritDAO',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2F5D50',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <PWAManager />
        <ModuleErrorBoundary>
          <Providers>{children}</Providers>
        </ModuleErrorBoundary>
      </body>
    </html>
  );
}

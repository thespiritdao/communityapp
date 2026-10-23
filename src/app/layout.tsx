// src/app/layout.tsx
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary';
import { PWAManager } from '@/components/PWAManager';
import { GA_MEASUREMENT_ID } from '@/lib/analytics';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { Providers } from './providers';
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
  description:
    'Decentralized community platform for coordination and governance',
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
  other: {
    'base:app_id': '69d3bb0887bcdc902b52fd3b',
  },
};

export const viewport: Viewport = {
  themeColor: '#2F5D50',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  // Android Chrome 108+ defaults to resizes-visual: the layout viewport keeps
  // its height when the soft keyboard opens, so position:fixed bottom elements
  // (bottom nav, chat input) stay hidden behind the keyboard. resizes-content
  // shrinks the layout viewport instead, lifting fixed elements above it.
  interactiveWidget: 'resizes-content',
};

// GA4 is loaded only in production builds so local dev and previews never
// pollute the property. See src/lib/analytics.ts for scope.
const ANALYTICS_ENABLED =
  process.env.NODE_ENV === 'production' && Boolean(GA_MEASUREMENT_ID);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {ANALYTICS_ENABLED && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`}
            </Script>
          </>
        )}
        <PWAManager />
        <ModuleErrorBoundary>
          <Providers>{children}</Providers>
        </ModuleErrorBoundary>
      </body>
    </html>
  );
}

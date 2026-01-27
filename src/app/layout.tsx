// src/app/layout.tsx
import type { ReactNode } from 'react';
import { Providers } from './providers';
import { ModuleErrorBoundary } from '@/components/ModuleErrorBoundary';
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
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full">
      {/* Avoid transforms on <html> that can break fixed positioning */}
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ModuleErrorBoundary>
          <Providers>{children}</Providers>
        </ModuleErrorBoundary>
      </body>
    </html>
  );
}

'use client';

/**
 * TourManager — reads the wallet address from CDP and feeds it to TourProvider.
 * Rendered inside providers.tsx so it has access to all provider contexts.
 * Also renders the global TourOverlay and TourPrompt portals.
 */

import { useEvmAddress } from '@coinbase/cdp-hooks';
import { TourProvider } from '@/context/TourContext';
import { TourOverlay } from './TourOverlay';
import { TourPrompt } from './TourPrompt';

interface TourManagerProps {
  children: React.ReactNode;
}

export function TourManager({ children }: TourManagerProps) {
  const { evmAddress } = useEvmAddress();

  return (
    <TourProvider walletAddress={evmAddress}>
      {children}
      <TourOverlay />
      <TourPrompt />
    </TourProvider>
  );
}

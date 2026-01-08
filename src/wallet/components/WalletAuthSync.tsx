// src/wallet/components/WalletAuthSync.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { useAuthContext } from '@/features/identity';

/**
 * Automatic Wallet Authentication Sync
 *
 * Ensures the CDP wallet address is always authenticated with Supabase.
 * This fixes RLS policy issues where the JWT doesn't contain the wallet_address.
 *
 * IMPORTANT: Place this component at the app root level so it runs on all pages.
 */
export function WalletAuthSync() {
  const { evmAddress } = useEvmAddress();
  const { isAuthenticated, signIn, loading } = useAuthContext();

  // Track if we've attempted authentication for this wallet
  const attemptedWalletRef = useRef<string | null>(null);
  const isAuthenticatingRef = useRef(false);

  useEffect(() => {
    const syncWalletAuth = async () => {
      // Skip if:
      // - No wallet connected
      // - Already authenticated
      // - Currently loading
      // - Currently authenticating
      // - Already attempted for this wallet
      if (
        !evmAddress ||
        isAuthenticated ||
        loading ||
        isAuthenticatingRef.current ||
        attemptedWalletRef.current === evmAddress
      ) {
        return;
      }

      console.log('🔄 WalletAuthSync: Syncing wallet with Supabase...', {
        wallet: evmAddress.substring(0, 10) + '...',
        isAuthenticated,
        loading,
      });

      isAuthenticatingRef.current = true;
      attemptedWalletRef.current = evmAddress;

      try {
        await signIn(evmAddress);
        console.log('✅ WalletAuthSync: Authentication successful');
      } catch (error) {
        console.error('❌ WalletAuthSync: Authentication failed:', error);
        // Reset on error so we can retry
        attemptedWalletRef.current = null;
      } finally {
        isAuthenticatingRef.current = false;
      }
    };

    syncWalletAuth();
  }, [evmAddress, isAuthenticated, loading, signIn]);

  // This component doesn't render anything
  return null;
}

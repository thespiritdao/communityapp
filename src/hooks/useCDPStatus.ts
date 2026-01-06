// src/hooks/useCDPStatus.ts
// Centralized hook for CDP wallet initialization status
// Prevents race conditions where components check useEvmAddress() before CDP is ready

import { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';

export interface CDPStatus {
  address: string | undefined;
  isConnected: boolean;
  isInitializing: boolean;
  isReady: boolean;
}

/**
 * Hook to check CDP wallet status with proper initialization handling
 *
 * Prevents the race condition where components check `useEvmAddress()` before
 * CDP wallet has finished initializing, causing "Login" buttons to show even
 * when user is authenticated.
 *
 * Usage:
 * ```typescript
 * const { address, isConnected, isInitializing, isReady } = useCDPStatus();
 *
 * if (isInitializing) {
 *   return <LoadingSpinner>Connecting wallet...</LoadingSpinner>;
 * }
 *
 * if (!isConnected) {
 *   return <ConnectWallet />;
 * }
 *
 * // Safe to use address here - CDP is ready
 * ```
 *
 * @param timeout - Max time to wait for CDP initialization (default: 3000ms)
 */
export function useCDPStatus(timeout: number = 3000): CDPStatus {
  const { evmAddress: address } = useEvmAddress();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    // If address is already available, CDP is ready
    if (address) {
      setIsInitializing(false);
      return;
    }

    // Otherwise, wait up to `timeout` milliseconds for CDP to initialize
    const timer = setTimeout(() => {
      setIsInitializing(false);
    }, timeout);

    return () => clearTimeout(timer);
  }, [address, timeout]);

  return {
    address,
    isConnected: !!address,
    isInitializing,
    isReady: !isInitializing,
  };
}

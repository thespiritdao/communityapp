// src/hooks/usePersistentWalletConnection.ts

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { walletVerificationService } from '@/services/walletVerificationService';

const WALLET_STATE_KEY = 'spiritdao_wallet_state';
const CONNECTION_RETRY_KEY = 'spiritdao_connection_retry';
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

interface PersistedWalletState {
  address: string;
  connectorId: string;
  isSmartWallet: boolean;
  timestamp: number;
  sessionId: string;
}

interface ConnectionRetryState {
  count: number;
  lastAttempt: number;
  backoffMs: number;
}

export function usePersistentWalletConnection() {
  const { address, isConnected, connector } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [isRestoringConnection, setIsRestoringConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSmartWallet, setIsSmartWallet] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const restorationAttempted = useRef(false);
  const verificationInProgress = useRef(false);
  const sessionId = useRef<string>(generateSessionId());

  /**
   * Save wallet state to localStorage
   */
  const saveWalletState = useCallback(() => {
    if (address && connector) {
      const state: PersistedWalletState = {
        address,
        connectorId: connector.id,
        isSmartWallet,
        timestamp: Date.now(),
        sessionId: sessionId.current,
      };

      try {
        localStorage.setItem(WALLET_STATE_KEY, JSON.stringify(state));
        console.log('💾 Wallet state saved:', state);
      } catch (error) {
        console.error('Failed to save wallet state:', error);
      }
    }
  }, [address, connector, isSmartWallet]);

  /**
   * Clear persisted wallet state
   */
  const clearWalletState = useCallback(() => {
    try {
      localStorage.removeItem(WALLET_STATE_KEY);
      localStorage.removeItem(CONNECTION_RETRY_KEY);
      walletVerificationService.clearCache();
      console.log('🧹 Wallet state cleared');
    } catch (error) {
      console.error('Failed to clear wallet state:', error);
    }
  }, []);

  /**
   * Get retry state with exponential backoff
   */
  const getRetryState = (): ConnectionRetryState => {
    try {
      const stored = localStorage.getItem(CONNECTION_RETRY_KEY);
      if (stored) {
        const state = JSON.parse(stored) as ConnectionRetryState;
        // Reset if last attempt was more than 5 minutes ago
        if (Date.now() - state.lastAttempt > 5 * 60 * 1000) {
          return { count: 0, lastAttempt: 0, backoffMs: 1000 };
        }
        return state;
      }
    } catch (error) {
      console.error('Failed to get retry state:', error);
    }
    return { count: 0, lastAttempt: 0, backoffMs: 1000 };
  };

  /**
   * Update retry state
   */
  const updateRetryState = (success: boolean) => {
    try {
      if (success) {
        localStorage.removeItem(CONNECTION_RETRY_KEY);
      } else {
        const current = getRetryState();
        const newState: ConnectionRetryState = {
          count: current.count + 1,
          lastAttempt: Date.now(),
          backoffMs: Math.min(current.backoffMs * 2, 30000), // Max 30 seconds
        };
        localStorage.setItem(CONNECTION_RETRY_KEY, JSON.stringify(newState));
      }
    } catch (error) {
      console.error('Failed to update retry state:', error);
    }
  };

  /**
   * Restore wallet connection from persisted state
   */
  const restoreConnection = useCallback(async () => {
    if (restorationAttempted.current || isConnected || isRestoringConnection) {
      return;
    }

    try {
      const stored = localStorage.getItem(WALLET_STATE_KEY);
      if (!stored) {
        return;
      }

      const state = JSON.parse(stored) as PersistedWalletState;

      // Check if session is still valid
      if (Date.now() - state.timestamp > SESSION_TIMEOUT) {
        console.log('⏰ Wallet session expired, clearing state');
        clearWalletState();
        return;
      }

      // Check retry state
      const retryState = getRetryState();
      if (retryState.count >= 3) {
        console.log('⚠️ Max connection retries reached');
        setConnectionError(
          'Failed to restore wallet connection after multiple attempts',
        );
        return;
      }

      console.log('🔄 Attempting to restore wallet connection:', state);
      restorationAttempted.current = true;
      setIsRestoringConnection(true);
      setConnectionError(null);

      // Find the connector
      const targetConnector = connectors.find(
        (c) => c.id === state.connectorId,
      );
      if (!targetConnector) {
        console.error('Connector not found:', state.connectorId);
        updateRetryState(false);
        return;
      }

      // Apply exponential backoff if needed
      if (retryState.count > 0) {
        console.log(
          `⏳ Waiting ${retryState.backoffMs}ms before retry attempt ${retryState.count + 1}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, retryState.backoffMs),
        );
      }

      // Attempt to connect
      await connect({ connector: targetConnector });

      // Update state
      setIsSmartWallet(state.isSmartWallet);
      updateRetryState(true);
      console.log('✅ Wallet connection restored successfully');
    } catch (error) {
      console.error('❌ Failed to restore wallet connection:', error);
      updateRetryState(false);
      setConnectionError('Failed to restore wallet connection');

      // Schedule retry if we haven't exceeded max attempts
      const retryState = getRetryState();
      if (retryState.count < 3) {
        setTimeout(() => {
          restorationAttempted.current = false;
          restoreConnection();
        }, retryState.backoffMs);
      }
    } finally {
      setIsRestoringConnection(false);
    }
  }, [
    isConnected,
    isRestoringConnection,
    connect,
    connectors,
    clearWalletState,
  ]);

  /**
   * Verify wallet type using centralized service
   */
  const verifyWallet = useCallback(async () => {
    if (!address || !connector || verificationInProgress.current) {
      return;
    }

    try {
      verificationInProgress.current = true;
      setIsVerifying(true);

      console.log('🔍 Verifying wallet using centralized service');
      const result = await walletVerificationService.verifyWallet(
        address,
        connector,
      );

      setIsSmartWallet(result.isSmartWallet);
      console.log('✅ Wallet verification complete:', result);

      // Save state after successful verification
      saveWalletState();
    } catch (error) {
      console.error('❌ Wallet verification failed:', error);
      setConnectionError('Failed to verify wallet type');
    } finally {
      verificationInProgress.current = false;
      setIsVerifying(false);
    }
  }, [address, connector, saveWalletState]);

  /**
   * Handle wallet disconnection
   */
  const handleDisconnect = useCallback(() => {
    console.log('👋 Wallet disconnected, clearing state');
    clearWalletState();
    disconnect();
  }, [disconnect, clearWalletState]);

  // Restore connection on mount
  useEffect(() => {
    if (!isConnected && !restorationAttempted.current) {
      restoreConnection();
    }
  }, [isConnected, restoreConnection]);

  // Verify wallet when connected
  useEffect(() => {
    if (
      isConnected &&
      address &&
      connector &&
      !verificationInProgress.current
    ) {
      verifyWallet();
    }
  }, [isConnected, address, connector, verifyWallet]);

  // Save wallet state when it changes
  useEffect(() => {
    if (isConnected && address && connector && !isVerifying) {
      saveWalletState();
    }
  }, [
    isConnected,
    address,
    connector,
    isSmartWallet,
    isVerifying,
    saveWalletState,
  ]);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        !isConnected &&
        !restorationAttempted.current
      ) {
        console.log('📱 Page became visible, checking wallet connection');
        restorationAttempted.current = false;
        restoreConnection();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isConnected, restoreConnection]);

  // Handle beforeunload to save state
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isConnected && address) {
        saveWalletState();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isConnected, address, saveWalletState]);

  return {
    isConnected,
    address,
    isSmartWallet,
    isRestoringConnection,
    isVerifying,
    connectionError,
    disconnect: handleDisconnect,
    clearError: () => setConnectionError(null),
    retryConnection: () => {
      restorationAttempted.current = false;
      restoreConnection();
    },
  };
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Centralized authentication hook for Embedded Wallets
// Simplified - no signature signing needed since Coinbase manages the wallet

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/utils/supabaseClient';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  session: Session | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
}

interface UseAuthReturn extends AuthState {
  signIn: (walletAddress: string, email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// Singleton pattern to ensure only one auth state across the app
let authStateInstance: AuthState | null = null;
const authStateListeners: Set<(state: AuthState) => void> = new Set();

function notifyAuthStateListeners(state: AuthState) {
  authStateInstance = state;
  authStateListeners.forEach((listener) => listener(state));
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(
    () =>
      authStateInstance || {
        session: null,
        loading: true,
        error: null,
        isAuthenticated: false,
      },
  );

  // Track if this hook instance has already initialized
  const hasInitialized = useRef(false);
  const isAuthenticating = useRef(false);

  // Stable ref so signIn can read current authState without being in its deps
  const authStateRef = useRef(authState);
  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  // Register this component to listen for auth state changes
  useEffect(() => {
    authStateListeners.add(setAuthState);

    // If another component already has auth state, use it
    if (authStateInstance && !hasInitialized.current) {
      setAuthState(authStateInstance);
    }

    return () => {
      authStateListeners.delete(setAuthState);
    };
  }, []);

  // Initialize session once on mount (only first mount across app)
  useEffect(() => {
    if (
      hasInitialized.current ||
      (authStateInstance && !authStateInstance.loading)
    ) {
      return;
    }

    hasInitialized.current = true;

    const initSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        const newState = {
          session,
          loading: false,
          error: null,
          isAuthenticated: !!session,
        };

        notifyAuthStateListeners(newState);
      } catch (error) {
        const newState = {
          session: null,
          loading: false,
          error: error as Error,
          isAuthenticated: false,
        };

        notifyAuthStateListeners(newState);
      }
    };

    initSession();

    // Set up auth state change listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const newState = {
        session,
        loading: false,
        error: null,
        isAuthenticated: !!session,
      };

      notifyAuthStateListeners(newState);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (walletAddress: string, email?: string) => {
      // If already authenticated with same wallet, skip
      if (
        authStateRef.current.session?.user?.user_metadata?.wallet_address ===
        walletAddress.toLowerCase()
      ) {
        console.log('✅ Auth: Already authenticated with this wallet');
        return;
      }

      // Prevent concurrent authentication attempts
      if (isAuthenticating.current) {
        console.warn('🔐 Auth: Authentication already in progress, skipping duplicate request');
        return; // Simply return without waiting - UI will update when auth completes
      }

      isAuthenticating.current = true;

      try {
        notifyAuthStateListeners({
          ...authStateRef.current,
          loading: true,
          error: null,
        });

        console.log('🔐 Auth: Authenticating embedded wallet...');

        // Retry logic with exponential backoff (3 attempts: 1s, 2s, 4s delays)
        const maxRetries = 3;
        let lastError: Error | null = null;
        let response: Response | null = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // For embedded wallets, we trust the wallet address from Coinbase
            // No signature verification needed - Coinbase manages the private keys
            response = await fetch('/api/auth/onchainkit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                address: walletAddress,
                email: email, // Pass email if available from CDP
                // Embedded wallet - no signature needed
                isEmbedded: true,
              }),
            });

            if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `Authentication failed: ${response.statusText}`);
            }

            // Success! Break out of retry loop
            break;
          } catch (error) {
            lastError = error as Error;

            // If this is the last attempt, don't wait
            if (attempt < maxRetries - 1) {
              const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
              console.log(`🔄 Auth: Retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
              await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
              console.error(`❌ Auth: All ${maxRetries} attempts failed`);
            }
          }
        }

        // If all retries failed, throw the last error
        if (!response || !response.ok) {
          throw lastError || new Error('Authentication failed after retries');
        }

        const { supabaseToken, supabaseRefreshToken } = await response.json();

        console.log('✅ Auth: Received tokens, setting session...');

        // Set Supabase session with JWT tokens
        const {
          data: { session },
          error,
        } = await supabase.auth.setSession({
          access_token: supabaseToken,
          refresh_token: supabaseRefreshToken,
        });

        if (error) throw error;

        const newState = {
          session,
          loading: false,
          error: null,
          isAuthenticated: true,
        };

        console.log('✅ Auth: Session created successfully');
        notifyAuthStateListeners(newState);
      } catch (error) {
        console.error('❌ Auth: Authentication failed:', error);

        const newState = {
          session: null,
          loading: false,
          error: error as Error,
          isAuthenticated: false,
        };

        notifyAuthStateListeners(newState);
        throw error; // Re-throw so calling code can handle
      } finally {
        isAuthenticating.current = false;
      }
    },
    [], // stable reference — reads authState via authStateRef
  );

  const signOut = useCallback(async () => {
    try {
      console.log('🚪 Auth: Signing out...');
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      const newState = {
        session: null,
        loading: false,
        error: null,
        isAuthenticated: false,
      };

      console.log('✅ Auth: Signed out successfully');
      notifyAuthStateListeners(newState);
    } catch (error) {
      console.error('❌ Auth: Sign out failed:', error);

      const newState = {
        ...authStateRef.current,
        error: error as Error,
      };

      notifyAuthStateListeners(newState);
    }
  }, []); // stable reference — reads authState via authStateRef

  const refreshSession = useCallback(async () => {
    try {
      notifyAuthStateListeners({
        ...authStateRef.current,
        loading: true,
      });

      const {
        data: { session },
        error,
      } = await supabase.auth.refreshSession();

      if (error) throw error;

      const newState = {
        session,
        loading: false,
        error: null,
        isAuthenticated: !!session,
      };

      notifyAuthStateListeners(newState);
    } catch (error) {
      const newState = {
        session: null,
        loading: false,
        error: error as Error,
        isAuthenticated: false,
      };

      notifyAuthStateListeners(newState);
    }
  }, []); // stable reference — reads authState via authStateRef

  return {
    ...authState,
    signIn,
    signOut,
    refreshSession,
  };
}

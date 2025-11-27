// Centralized authentication hook for managing Supabase session
// Prevents session conflicts and provides single source of truth

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
  signIn: (walletAddress: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// Singleton pattern to ensure only one auth state across the app
let authStateInstance: AuthState | null = null;
const authStateListeners: Set<(state: AuthState) => void> = new Set();

function notifyAuthStateListeners(state: AuthState) {
  authStateInstance = state;
  authStateListeners.forEach(listener => listener(state));
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>(() => 
    authStateInstance || {
      session: null,
      loading: true,
      error: null,
      isAuthenticated: false,
    }
  );

  // Track if this hook instance has already initialized
  const hasInitialized = useRef(false);
  const isAuthenticating = useRef(false);

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
    if (hasInitialized.current || (authStateInstance && !authStateInstance.loading)) {
      return;
    }
    
    hasInitialized.current = true;
    
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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

  const signIn = useCallback(async (walletAddress: string) => {
    // Prevent concurrent authentication attempts
    if (isAuthenticating.current) {
      return;
    }

    // If already authenticated with same wallet, skip
    if (authState.session?.user?.user_metadata?.wallet_address === walletAddress.toLowerCase()) {
      return;
    }

    isAuthenticating.current = true;
    
    try {
      notifyAuthStateListeners({
        ...authState,
        loading: true,
        error: null,
      });

      // Try to get existing session first
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      
      if (existingSession?.user?.user_metadata?.wallet_address === walletAddress.toLowerCase()) {
        // Already have valid session for this wallet
        const newState = {
          session: existingSession,
          loading: false,
          error: null,
          isAuthenticated: true,
        };
        
        notifyAuthStateListeners(newState);
        return;
      }

      // Create new session for wallet
      const response = await fetch('/api/auth/onchainkit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const { supabaseToken, supabaseRefreshToken } = await response.json();
      
      const { data: { session }, error } = await supabase.auth.setSession({
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
      
      notifyAuthStateListeners(newState);
    } catch (error) {
      const newState = {
        session: null,
        loading: false,
        error: error as Error,
        isAuthenticated: false,
      };
      
      notifyAuthStateListeners(newState);
    } finally {
      isAuthenticating.current = false;
    }
  }, [authState]);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      const newState = {
        session: null,
        loading: false,
        error: null,
        isAuthenticated: false,
      };
      
      notifyAuthStateListeners(newState);
    } catch (error) {
      const newState = {
        ...authState,
        error: error as Error,
      };
      
      notifyAuthStateListeners(newState);
    }
  }, [authState]);

  const refreshSession = useCallback(async () => {
    try {
      notifyAuthStateListeners({
        ...authState,
        loading: true,
      });

      const { data: { session }, error } = await supabase.auth.refreshSession();
      
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
  }, [authState]);

  return {
    ...authState,
    signIn,
    signOut,
    refreshSession,
  };
}
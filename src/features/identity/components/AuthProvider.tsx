// AuthProvider - Provides centralized auth state to entire app
import type React from 'react';
import { createContext, useContext } from 'react';
import { useAuth } from '../hooks/useAuth';

interface AuthContextType {
  session: any;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (address: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { session, loading, isAuthenticated, signIn, signOut } = useAuth();

  // Removed auto-authentication to prevent conflicts with main page auth flow
  // Authentication is now handled exclusively by page.tsx for better control

  const value = {
    session,
    loading,
    isAuthenticated,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
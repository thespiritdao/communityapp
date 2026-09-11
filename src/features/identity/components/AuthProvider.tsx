// AuthProvider - Provides centralized auth state to entire app
import type React from 'react';
import { createContext, useContext } from 'react';
import { useAuth, type LinkingRequired } from '../hooks/useAuth';
import { LinkNewDeviceModal } from './LinkNewDeviceModal';
import { SessionGuard } from './SessionGuard';

interface AuthContextType {
  session: any;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (address: string, email?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Non-null when the current CDP wallet must be linked before sign-in
   * can complete. UI should render the link-device modal in response.
   */
  linkingRequired: LinkingRequired | null;
  clearLinkingRequired: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    session,
    loading,
    isAuthenticated,
    signIn,
    signOut,
    linkingRequired,
    clearLinkingRequired,
  } = useAuth();

  // page.tsx owns the first-run auth + onboarding sequence on '/'. Everywhere
  // else, <SessionGuard> re-establishes a lapsed Supabase session so the
  // wallet and the session can't drift apart (see SessionGuard.tsx).

  const value = {
    session,
    loading,
    isAuthenticated,
    signIn,
    signOut,
    linkingRequired,
    clearLinkingRequired,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SessionGuard />
      <LinkNewDeviceModal />
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

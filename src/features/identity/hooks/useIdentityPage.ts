import { useState, useCallback } from 'react';
import { ensureAuthHeaders } from '@/lib/authHeaders';
import { useDisconnect } from 'wagmi';
import { useAuth } from './useAuth';
import { useUserProfile } from './useUserProfile';
import { updateProfile } from '../utils/updateProfile';

export function useIdentityPage(address: string | undefined) {
  const [isEditing, setIsEditing] = useState(false);
  const { session, signOut } = useAuth();
  const { profile, loading, refetch } = useUserProfile(address);
  const { disconnect } = useDisconnect();

  const handleEditClick = useCallback(() => {
    setIsEditing(!isEditing);
  }, [isEditing]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (data: any) => {
      if (!address) return;
      setSaveError(null);

      // Detect first-time identity completion (name being set for the first time)
      const isFirstIdentity = !profile?.first_name && !!data.first_name;

      try {
        await updateProfile(address, data);
      } catch (err: any) {
        const msg = err?.message || 'Failed to save profile. Please try again.';
        setSaveError(msg);
        return;
      }

      if (isFirstIdentity) {
        try {
          await fetch('/api/explorer/member-introduced', {
            method: 'POST',
            headers: await ensureAuthHeaders(),
            body: JSON.stringify({
              walletAddress: address,
              displayName: [data.first_name, data.last_name].filter(Boolean).join(' '),
              profilePicture: data.profile_picture ?? null,
            }),
          });
        } catch {
          // non-critical — identity save already completed
        }
      }

      setIsEditing(false);
      // Reload the page to show updated profile data immediately
      window.location.reload();
    },
    [address, profile],
  );

  const handleLogout = useCallback(async () => {
    console.log('🚪 Logging out...');

    // Mark this device as having a registered user so that after logout the
    // login page shows the email/Google auth screen, not the invite gate.
    localStorage.setItem('returning_user', 'true');

    // Signal to the login page that the user explicitly logged out and wants
    // to choose an account — suppress the fast-path auto-signIn.
    localStorage.setItem('force_account_switch', 'true');

    // 1. Sign out from Supabase (clears auth session)
    await signOut();
    console.log('✅ Supabase session cleared');

    // 2. Disconnect wallet (prevents auto-reconnect)
    disconnect();
    console.log('✅ Wallet disconnected');

    // 3. Clear wallet cache and CDP session so the embedded wallet re-prompts
    localStorage.removeItem('wagmi.store');
    localStorage.removeItem('wagmi.cache');
    localStorage.removeItem('wagmi.recentConnectorId');
    // Clear CDP/Coinbase embedded wallet keys so a different account can sign in
    Object.keys(localStorage).forEach((key) => {
      if (
        key.startsWith('cdp_') ||
        key.startsWith('coinbase_') ||
        key.startsWith('cbw_') ||
        key.includes('embedded_wallet')
      ) {
        localStorage.removeItem(key);
      }
    });
    console.log('✅ Wallet cache cleared');

    // 4. Redirect to home after a brief delay
    setTimeout(() => {
      window.location.href = '/';
    }, 500);
  }, [signOut, disconnect]);

  return {
    // State
    isEditing,
    profile,
    loading,
    session,
    saveError,

    // Actions
    handleEditClick,
    handleCancel,
    handleSave,
    handleLogout,
  };
}

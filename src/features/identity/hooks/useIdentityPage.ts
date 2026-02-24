import { useState, useCallback } from 'react';
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

  const handleSave = useCallback(
    async (data: any) => {
      if (!address) return;

      await updateProfile(address, data);
      setIsEditing(false);
      // Reload the page to show updated profile data immediately
      window.location.reload();
    },
    [address],
  );

  const handleLogout = useCallback(async () => {
    console.log('🚪 Logging out...');

    // Mark this device as having a registered user so that after logout the
    // login page shows the email/Google auth screen, not the invite gate.
    localStorage.setItem('returning_user', 'true');

    // 1. Sign out from Supabase (clears auth session)
    await signOut();
    console.log('✅ Supabase session cleared');

    // 2. Disconnect wallet (prevents auto-reconnect)
    disconnect();
    console.log('✅ Wallet disconnected');

    // 3. Clear wallet cache
    localStorage.removeItem('wagmi.store');
    localStorage.removeItem('wagmi.cache');
    localStorage.removeItem('wagmi.recentConnectorId');
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

    // Actions
    handleEditClick,
    handleCancel,
    handleSave,
    handleLogout,
  };
}

import { useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useUserProfile } from './useUserProfile';
import { updateProfile } from '../utils/updateProfile';

export function useIdentityPage(address: string | undefined) {
  const [isEditing, setIsEditing] = useState(false);
  const { session, signOut } = useAuth();
  const { profile, loading, refetch } = useUserProfile(address);

  const handleEditClick = useCallback(() => {
    setIsEditing(!isEditing);
  }, [isEditing]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSave = useCallback(async (data: any) => {
    if (!address) return;
    
    await updateProfile(address, data);
    setIsEditing(false);
    await refetch();
  }, [address, refetch]);

  const handleLogout = useCallback(async () => {
    await signOut();
  }, [signOut]);

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
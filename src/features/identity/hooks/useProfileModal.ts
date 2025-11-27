import { useState, useCallback } from 'react';
import { EventService } from '../../events/lib/supabase';
import type { UserProfile } from '../types';

export interface UseProfileModalReturn {
  selectedUser: UserProfile | null;
  users: UserProfile[];
  isOpen: boolean;
  openProfileModal: (walletAddress: string) => Promise<void>;
  closeProfileModal: () => void;
}

/**
 * Hook for managing ProfileModal state and user data fetching
 */
export const useProfileModal = (): UseProfileModalReturn => {
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const openProfileModal = useCallback(async (walletAddress: string) => {
    try {
      console.log('🔍 Opening profile modal for:', walletAddress);
      
      // Fetch user profile by wallet address
      const profile = await EventService.getUserProfileByWallet(walletAddress);
      
      if (profile) {
        setSelectedUser(profile);
        setUsers([profile]); // ProfileModal expects users array
        setIsOpen(true);
      } else {
        
        // Create a minimal profile for unknown users
        const fallbackProfile: UserProfile = {
          wallet_address: walletAddress,
          first_name: walletAddress.slice(0, 6),
          last_name: '...',
          bio: null,
          profile_picture: null,
          website: null,
          twitter: null,
          discord: null,
          github: null,
          linkedin: null,
          email: null,
          tiktok: null,
          instagram: null,
          facebook: null,
          youtube: null,
          twitch: null,
          interests: null,
          seeking: null,
          open_to_connect: null
        };
        setSelectedUser(fallbackProfile);
        setUsers([fallbackProfile]);
        setIsOpen(true);
      }
    } catch (error) {
      
    }
  }, []);

  const closeProfileModal = useCallback(() => {
    setSelectedUser(null);
    setUsers([]);
    setIsOpen(false);
  }, []);

  return {
    selectedUser,
    users,
    isOpen,
    openProfileModal,
    closeProfileModal
  };
};

export default useProfileModal;
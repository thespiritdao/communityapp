// src/components/UserProfileDisplay.tsx
'use client';

import type React from 'react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useProfileModal } from '@/features/identity/hooks/useProfileModal';
import { ProfileModal } from '@/features/identity/components/ProfileModal';

interface UserProfile {
  wallet_address: string;
  first_name?: string;
  last_name?: string;
  profile_picture?: string;
}

interface UserProfileDisplayProps {
  walletAddress: string;
  size?: 'sm' | 'md' | 'lg';
  showModal?: boolean;
  className?: string;
}

export const UserProfileDisplay: React.FC<UserProfileDisplayProps> = ({
  walletAddress,
  size = 'sm',
  showModal = true,
  className = '',
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { selectedUser, users, isOpen, openProfileModal, closeProfileModal } =
    useProfileModal();

  useEffect(() => {
    fetchUserProfile();
  }, [walletAddress]);

  const fetchUserProfile = async () => {
    if (!walletAddress) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('public_profiles')
        .select('wallet_address, first_name, last_name, profile_picture')
        .eq('wallet_address', walletAddress.toLowerCase())
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 means no rows found
        console.error('Error fetching user profile:', error);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getDisplayName = () => {
    if (!profile) return formatAddress(walletAddress);

    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }

    if (profile.first_name) {
      return profile.first_name;
    }

    return formatAddress(walletAddress);
  };

  const getProfilePicture = () => {
    if (!profile?.profile_picture) {
      return '/observableinfinities.png';
    }

    // If it's already a full URL, return as is
    if (profile.profile_picture.startsWith('http')) {
      return profile.profile_picture;
    }

    // Otherwise, construct the Supabase storage URL
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${profile.profile_picture}`;
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return {
          image: 'w-6 h-6',
          text: 'text-sm',
        };
      case 'md':
        return {
          image: 'w-8 h-8',
          text: 'text-base',
        };
      case 'lg':
        return {
          image: 'w-10 h-10',
          text: 'text-lg',
        };
      default:
        return {
          image: 'w-6 h-6',
          text: 'text-sm',
        };
    }
  };

  const sizeClasses = getSizeClasses();

  if (isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div
          className={`${sizeClasses.image} bg-gray-200 rounded-full animate-pulse`}
        ></div>
        <div className={`h-4 bg-gray-200 rounded animate-pulse w-20`}></div>
      </div>
    );
  }

  const handleClick = () => {
    if (showModal) {
      openProfileModal(walletAddress);
    }
  };

  return (
    <>
      <div
        className={`flex items-center space-x-2 ${showModal ? 'cursor-pointer hover:opacity-80' : ''} ${className}`}
        onClick={handleClick}
      >
        <img
          src={getProfilePicture()}
          alt={getDisplayName()}
          className={`${sizeClasses.image} rounded-full object-cover border border-gray-200`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src =
              '/observableinfinities.png';
          }}
        />
        <span
          className={`${sizeClasses.text} font-medium text-gray-900 truncate`}
        >
          {getDisplayName()}
        </span>
      </div>

      {showModal && isOpen && selectedUser && (
        <ProfileModal
          user={selectedUser}
          users={users}
          onClose={closeProfileModal}
        />
      )}
    </>
  );
};

export default UserProfileDisplay;

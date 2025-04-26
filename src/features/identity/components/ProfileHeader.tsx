import React from 'react';
import { Avatar } from './Avatar';
import { Name } from './Name';
import { Address } from './Address';
import type { Address as AddressType } from 'viem'; // assuming Address type comes from viem

type ProfileHeaderProps = {
  // The user’s data, including the profile_picture URL
  profile?: {
    first_name?: string;
    last_name?: string;
    profile_picture?: string | null;
    wallet_address?: string;
  };
  className?: string;
};

export function ProfileHeader({ profile, className }: ProfileHeaderProps) {
  if (!profile) {
    return null; // or some fallback
  }

  return (
    <div className={`profile-header ${className}`}>
      {/* Profile Image */}
      <div className="profile-image-container">
        <img
          src={
            profile.profile_picture
              ? profile.profile_picture
              : '/images/symbolobinfin.png'
          }
          alt={`${profile.first_name || ''} ${profile.last_name || ''}`}
          className="profile-image"
        />
      </div>

      {/* Basic Name / Address Info */}
      <div style={{ marginTop: '10px' }}>
        <h3>
          {profile.first_name} {profile.last_name}
        </h3>
        
        {/* 
          If you want to show the address with line breaks, 
          you can style it to wrap. 
        */}
        <p className="wallet-address">{profile.wallet_address}</p>
      </div>
    </div>
  );
}
'use client';
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Footer } from 'src/components/Footer';
import { Badge } from 'src/identity/components/Badge';
import { IdentityCard } from 'src/identity/components/IdentityCard';
import { Socials } from 'src/identity/components/Socials';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import { ProfileHeader } from 'src/identity/components/ProfileHeader';
import { useUserProfile } from 'src/identity/hooks/useUserProfile';
import { updateProfile } from 'src/identity/utils/updateProfile';
import { ProfileEditForm } from 'src/identity/components/ProfileEditForm';
import 'src/styles/identityStyles.css';

export default function IdentityPage() {
  return (
    <OnchainProviders>
      <IdentityPageContent />
    </OnchainProviders>
  );
}

function IdentityPageContent() {
  const [isClient, setIsClient] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { address } = useAccount();
  const { profile, loading, refetch } = useUserProfile(address);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || loading) {
    return <p>Loading...</p>;
  }

  if (!address) {
    return (
      <div className="wrapper">
        <p className="text-center text-white">
          Please connect your wallet to view your profile.
        </p>
      </div>
    );
  }

  const handleEditClick = () => {
    setIsEditing(!isEditing);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleSave = async (data) => {
    if (!address) return;
    await updateProfile(address, data);
    setIsEditing(false);
    await refetch(); // Refresh profile data after saving
  };

  return (
    <div className="identity-container">
      <div className="profile-section">
        <div className="flex items-center justify-between">
          <h2>Profile</h2>
          {!isEditing && (
            <button className="button button-enter" onClick={handleEditClick}>
              Edit Profile
            </button>
          )}
        </div>
        {isEditing ? (
          <ProfileEditForm
            initialData={profile || {}}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <ProfileHeader address={address} profile={profile} />
        )}
      </div>

      <div className="identity-card-section">
        <IdentityCard address={address} />
      </div>

      <div className="badges-section">
        <h2>Badges</h2>
        <Badge address={address} />
      </div>

      <div className="socials-section">
        <h2>Socials</h2>
        <Socials address={address} />
      </div>

      <Footer />
    </div>
  );
}

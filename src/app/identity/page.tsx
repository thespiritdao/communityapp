'use client';
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Footer } from 'src/components/Footer';
import { Badge } from 'src/identity/components/Badge';
import { IdentityCard } from 'src/identity/components/IdentityCard';
import { Socials } from 'src/identity/components/Socials';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
import { ProfileHeader } from 'src/identity/components/ProfileHeader'; // Import ProfileHeader
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null; // Prevent rendering on server-side
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

  return (
    <div className="identity-container">
      <div className="profile-section">
        <div className="flex items-center justify-between">
          <h2>Profile</h2>
          <button className="button button-enter" onClick={handleEditClick}>
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>
        {isEditing ? (
          <form>
            {/* Add form fields to edit name, avatar, etc. */}
            <input type="text" defaultValue="User Name" className="input" />
            <button type="submit" className="button button-enter">
              Save Changes
            </button>
          </form>
        ) : (
          <ProfileHeader address={address} /> // Use the ProfileHeader here
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

<<<<<<< HEAD
// src/app/identity/page.tsx

=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
'use client';
import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Footer } from 'src/components/Footer';
import { Badge } from 'src/identity/components/Badge';
import { IdentityCard } from 'src/identity/components/IdentityCard';
import { Socials } from 'src/identity/components/Socials';
import { OnchainProviders } from 'src/wallet/components/OnchainProviders';
<<<<<<< HEAD
import { ProfileHeader } from 'src/identity/components/ProfileHeader'; 
import { useUserProfile } from 'src/identity/hooks/useUserProfile';
import { updateProfile } from 'src/identity/utils/updateProfile';
import { ProfileEditForm } from 'src/identity/components/ProfileEditForm';

=======
import { ProfileHeader } from 'src/identity/components/ProfileHeader'; // Import ProfileHeader
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
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
<<<<<<< HEAD
  
  const { profile, loading, refetch } = useUserProfile(address);

=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151

  useEffect(() => {
    setIsClient(true);
  }, []);

<<<<<<< HEAD
  if (!isClient || loading) {
    return <p>Loading...</p>;
  }

=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
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
<<<<<<< HEAD
  
  const handleCancel = () => {
    setIsEditing(false);
  };

	const handleSave = async (data) => {
	  if (!address) return;
	  await updateProfile(address, data);
	  setIsEditing(false);
	  // Now refetch to update the profile data
	  await refetch();
	};
=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151

  return (
    <div className="identity-container">
      <div className="profile-section">
<<<<<<< HEAD

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
			refetch={refetch}
          />
        ) : (
          <ProfileHeader address={address} profile={profile} />
        )}
      </div>

      <div className="identity-card-section">
        <IdentityCard address={address} />
      </div>

=======
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
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
      <div className="badges-section">
        <h2>Badges</h2>
        <Badge address={address} />
      </div>
<<<<<<< HEAD

=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
      <div className="socials-section">
        <h2>Socials</h2>
        <Socials address={address} />
      </div>
<<<<<<< HEAD

=======
>>>>>>> f7c82eaeab60ec2a9faa7b220126f2f5045f3151
      <Footer />
    </div>
  );
}

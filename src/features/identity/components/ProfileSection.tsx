import React from 'react';
import { ProfileDisplay } from './ProfileDisplay';
import { ProfileEditForm } from './ProfileEditForm';

interface ProfileSectionProps {
  profile: any;
  address: string;
  isEditing: boolean;
  authSession: any;
  onEditClick: () => void;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  saveError?: string | null;
}

export const ProfileSection: React.FC<ProfileSectionProps> = React.memo(
  ({
    profile,
    address,
    isEditing,
    authSession,
    onEditClick,
    onSave,
    onCancel,
    saveError,
  }) => (
    <div className="profile-section-container">
      <h2>
        <strong>Profile</strong>
      </h2>
      {isEditing ? (
        <ProfileEditForm
          initialData={profile || {}}
          walletAddress={address}
          onSave={onSave}
          onCancel={onCancel}
          saveError={saveError}
        />
      ) : (
        <ProfileDisplay
          profile={profile}
          address={address}
          onEditClick={onEditClick}
        />
      )}
    </div>
  ),
);

ProfileSection.displayName = 'ProfileSection';

// src/identity/components/ProfileModal.tsx
import React from 'react';
import { UserProfile } from '@/identity/types';
import "src/identity/styles/ProfileModal.css";

interface ProfileModalProps {
  user: UserProfile;
  users: UserProfile[]; // Pass the `users` array to the modal
  onClose: () => void;
}

const getProfilePictureUrl = (walletAddress: string, users: UserProfile[]) => {
  const user = users.find((user) => user.wallet_address === walletAddress);

  // Check if profile_picture is already a full URL
  if (user?.profile_picture?.startsWith('http')) {
    return user.profile_picture; // Return as is if it's a full URL
  }

  // Otherwise, construct the full URL
  return user?.profile_picture
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
    : '/images/symbolobinfin.png'; // Default avatar path
};

const ProfileModal: React.FC<ProfileModalProps> = ({ user, users, onClose }) => {
  const profilePictureUrl = getProfilePictureUrl(user.wallet_address, users);

  return (
    <div className="profile-modal">
      <button className="close-button" onClick={onClose}>
        ✖
      </button>
      {/* Profile Image */}
      <div className="profile-image-container">
        <img
          src={profilePictureUrl}
          alt={`${user.first_name} ${user.last_name}'s profile`}
          className="profile-image"
        />
      </div>
      {/* Section 1: Basic Info */}
		<div className="profile-section">
		  <h2>{`${user.first_name} ${user.last_name}`}</h2>

		  {/* Website */}
		  {user.website && (
			<a href={user.website} target="_blank" rel="noopener noreferrer">
			  {user.website}
			</a>
		  )}

		  {/* Bio */}
		  {user.bio && (
			<p className="user-bio">
			  {user.bio}
			</p>
		  )}
		</div>
      <hr />
      {/* Section 2: Interests and Seeking */}
      <div className="profile-section">
        <h3>Interests</h3>
        <p>{user.interests || "Not specified"}</p>
        <h3>Seeking</h3>
        <p>{user.seeking || "Not specified"}</p>
        <h3>Open to Connect</h3>
        <p>{user.open_to_connect ? "Yes" : "No"}</p>
      </div>
      <hr />
      {/* Section 3: Social Icons */}
      <div className="profile-section social-icons">
        {[
          "twitter",
          "tiktok",
          "instagram",
          "facebook",
          "discord",
          "youtube",
          "twitch",
          "github",
          "linkedin",
          "email",
        ].map((platform) =>
          user[platform] ? (
            <a
              key={platform}
              href={user[platform]}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={`/images/socialicons/${platform}.png`}
                alt={platform}
                className="social-icon"
              />
            </a>
          ) : null
        )}
      </div>
    </div>
  );
};

export default ProfileModal;

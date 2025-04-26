import React from 'react';
import { UserProfile } from 'src/features/identity/types';
import { TokenGallery } from 'src/features/identity/components/TokenGallery';
import { mapStoredValuesToLabels } from 'src/features/identity/utils/formatProfileValues';
import { interestsOptions, seekingOptions } from 'src/features/identity/constants/profileOptions';
import "src/features/identity/styles/ProfileModal.css";

interface ProfileModalProps {
  user: UserProfile;
  users: UserProfile[];
  onClose: () => void;
}

const getProfilePictureUrl = (walletAddress: string, users: UserProfile[]) => {
  const user = users.find((user) => user.wallet_address === walletAddress);

  if (user?.profile_picture?.startsWith('http')) {
    return user.profile_picture;
  }

  return user?.profile_picture
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
    : '/images/symbolobinfin.png';
};

const ProfileModal: React.FC<ProfileModalProps> = ({ user, users, onClose }) => {
  const profilePictureUrl = getProfilePictureUrl(user.wallet_address, users);

  return (
    <div className="profile-modal">
      <button className="close-button" onClick={onClose}>✖</button>

      {/* Profile Image */}
      <div className="profile-image-container">
        <img
          src={profilePictureUrl}
          alt={`${user.first_name} ${user.last_name}'s profile`}
          className="profile-image"
        />
      </div>

      {/* Section: Basic Info */}
      <div className="profile-section">
        <h2>{`${user.first_name} ${user.last_name}`}</h2>

        {user.website && (
          <a href={user.website} target="_blank" rel="noopener noreferrer">
            {user.website}
          </a>
        )}

        {user.bio && <p className="user-bio">{user.bio}</p>}
      </div>

      <hr />

      {/* Section: Interests */}
		<div className="profile-section">
		  <h3>Interests</h3>
		  <ul>
			{mapStoredValuesToLabels(user.interests, interestsOptions).map((label, i) => (
			  <li key={i}>{label}</li>
			))}
		  </ul>

		  <h3>Seeking</h3>
		  <ul>
			{mapStoredValuesToLabels(user.seeking, seekingOptions).map((label, i) => (
			  <li key={i}>{label}</li>
			))}
		  </ul>

		  <h3>Open to Connect</h3>
		  <p>
			{
			  {
				low_limited: "Low / Limited",
				open_available: "Open / Available",
				actively_collaborate: "Actively looking to collaborate",
			  }[user.open_to_connect || ''] || "Not specified"
			}
		  </p>
		</div>

      <hr />

      {/* Section: Tokens */}
      <div className="profile-section token-gallery-modal">
        <h3>Memberships</h3>
        <TokenGallery walletAddress={user.wallet_address} category="membership" />

        <h3 style={{ marginTop: "20px" }}>Credentials</h3>
        <TokenGallery walletAddress={user.wallet_address} category="credential" />
      </div>

      <hr />

      {/* Section: Social Icons */}
      <div className="profile-section social-icons">
        {[
          "twitter", "tiktok", "instagram", "facebook",
          "discord", "youtube", "twitch", "github", "linkedin", "email"
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

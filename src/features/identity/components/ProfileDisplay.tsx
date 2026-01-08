'use client';

import { mapStoredValuesToLabels } from '@/features/identity/utils/formatProfileValues';
import {
  interestsOptions,
  seekingOptions,
} from '@/features/identity/constants/profileOptions';
import {
  Lightbulb,
  Search,
  ChevronsRightLeft,
  Twitter,
  Instagram,
  Facebook,
  Youtube,
  Github,
  Linkedin,
  Mail,
  MessageCircle,
  Video,
} from 'lucide-react';

interface ProfileDisplayProps {
  profile: any;
  address: string;
  onEditClick: () => void;
}

// Social platform configuration with Lucide icons
const SOCIAL_PLATFORMS = [
  { key: 'twitter', label: 'Twitter', Icon: Twitter },
  { key: 'tiktok', label: 'TikTok', Icon: Video },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'discord', label: 'Discord', Icon: MessageCircle },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'twitch', label: 'Twitch', Icon: Video },
  { key: 'github', label: 'GitHub', Icon: Github },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { key: 'email', label: 'Email', Icon: Mail },
];

// Format social link to show readable username/handle
const formatSocialLink = (url: string) => {
  if (!url) return url;

  // Remove protocol and www
  let formatted = url.replace(/^https?:\/\/(www\.)?/, '');

  // If it's an email, just show it
  if (formatted.includes('@') && !formatted.includes('/')) {
    return formatted;
  }

  // Truncate long URLs
  if (formatted.length > 40) {
    return formatted.substring(0, 37) + '...';
  }

  return formatted;
};

export const ProfileDisplay: React.FC<ProfileDisplayProps> = ({
  profile,
  address,
  onEditClick,
}) => {
  const profilePictureUrl =
    profile?.profile_picture || '/images/symbolobinfin.png';

  // Debug logging
  console.log('[ProfileDisplay] Rendering with profile:', {
    hasProfile: !!profile,
    interests: profile?.interests,
    seeking: profile?.seeking,
    open_to_connect: profile?.open_to_connect,
    twitter: profile?.twitter,
    discord: profile?.discord,
    allKeys: profile ? Object.keys(profile) : [],
  });

  return (
    <div className="profile-content">
      {/* Profile Image */}
      <div className="profile-image-container">
        <img
          src={profilePictureUrl}
          alt={`${profile?.first_name} ${profile?.last_name}'s profile`}
          className="profile-image"
        />
      </div>

      {/* Section: Basic Info */}
      <div className="profile-section">
        <div className="profile-info">
          <h2 style={{ marginBottom: '12px' }}>{`${profile?.first_name || ''} ${profile?.last_name || ''}`}</h2>

          {profile?.website && (
            <a href={profile.website} target="_blank" rel="noopener noreferrer">
              {profile.website}
            </a>
          )}

          {profile?.bio && <p className="user-bio">{profile.bio}</p>}

          {/* Edit Profile Button */}
          <button
            className="btn"
            style={{ marginTop: '16px', display: 'block' }}
            onClick={onEditClick}
          >
            Edit Profile
          </button>
        </div>
      </div>

      <hr />

      {/* Section: Interests */}
      <div className="profile-section interests-section">
        <div className="interests-subsection">
          <h3 className="interests-heading">
            <span className="interests-icon">
              <Lightbulb size={18} strokeWidth={2} />
            </span>
            Interests
          </h3>
          {profile?.interests &&
          mapStoredValuesToLabels(profile.interests, interestsOptions).length >
            0 ? (
            <div className="interests-tags">
              {mapStoredValuesToLabels(profile.interests, interestsOptions).map(
                (label, i) => (
                  <span key={i} className="interest-tag">
                    {label}
                  </span>
                ),
              )}
            </div>
          ) : (
            <p className="interests-empty">No interests specified</p>
          )}
        </div>

        <div className="interests-subsection">
          <h3 className="interests-heading">
            <span className="interests-icon">
              <Search size={18} strokeWidth={2} />
            </span>
            Seeking
          </h3>
          {profile?.seeking &&
          mapStoredValuesToLabels(profile.seeking, seekingOptions).length >
            0 ? (
            <div className="interests-tags">
              {mapStoredValuesToLabels(profile.seeking, seekingOptions).map(
                (label, i) => (
                  <span key={i} className="interest-tag seeking-tag">
                    {label}
                  </span>
                ),
              )}
            </div>
          ) : (
            <p className="interests-empty">
              Not seeking anything at the moment
            </p>
          )}
        </div>

        <div className="interests-subsection">
          <h3 className="interests-heading">
            <span className="interests-icon">
              <ChevronsRightLeft size={18} strokeWidth={2} />
            </span>
            Open to Connect
          </h3>
          <div className="connect-status">
            <span
              className={`connect-badge ${profile?.open_to_connect || 'not-specified'}`}
            >
              {({
                low_limited: 'Low / Limited',
                open_available: 'Open / Available',
                actively_collaborate: 'Actively looking to collaborate',
              } as Record<string, string>)[profile?.open_to_connect || ''] || 'Not specified'}
            </span>
          </div>
        </div>
      </div>

      <hr />

      {/* Section: Social Links */}
      <div className="profile-section">
        <h3>Connect</h3>
        <div className="social-links">
          {SOCIAL_PLATFORMS.filter(({ key }) => {
            const value = profile?.[key];
            return value && value !== '';
          }).map(({ key, label, Icon }) => {
            const url = profile?.[key] as string;
            return (
              <div key={key} className="social-link-item">
                <Icon size={16} className="social-link-icon" />
                <span className="social-link-label">{label}:</span>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link-url"
                >
                  {formatSocialLink(url)}
                </a>
              </div>
            );
          })}
          {SOCIAL_PLATFORMS.filter(({ key }) => {
            const value = profile?.[key];
            return value && value !== '';
          }).length === 0 && (
            <p className="interests-empty">No social links added</p>
          )}
        </div>
      </div>
    </div>
  );
};

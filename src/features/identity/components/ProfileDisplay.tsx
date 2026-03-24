'use client';

import { mapStoredValuesToLabels } from '@/features/identity/utils/formatProfileValues';
import {
  interestsOptions,
  seekingOptions,
} from '@/features/identity/constants/profileOptions';
import {
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

      {/* Section: Interests */}
      {profile?.interests && mapStoredValuesToLabels(profile.interests, interestsOptions).length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Interests</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {mapStoredValuesToLabels(profile.interests, interestsOptions).map((label, i) => (
              <span key={i} style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', background: '#F0F5F3', color: '#2F5D50', fontWeight: 500 }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Section: Seeking */}
      {profile?.seeking && mapStoredValuesToLabels(profile.seeking, seekingOptions).length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Seeking</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {mapStoredValuesToLabels(profile.seeking, seekingOptions).map((label, i) => (
              <span key={i} style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', background: '#F9F5F0', color: '#6B5A3E', fontWeight: 500 }}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Section: Open to Connect */}
      {profile?.open_to_connect && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Open to Connect</h3>
          <span style={{
            fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', fontWeight: 500,
            background: profile.open_to_connect === 'actively_collaborate' ? '#2F5D50' : profile.open_to_connect === 'open_available' ? '#E8F1EE' : '#F0F0F0',
            color: profile.open_to_connect === 'actively_collaborate' ? '#fff' : profile.open_to_connect === 'open_available' ? '#2F5D50' : '#8FA09A',
          }}>
            {({ low_limited: 'Low / Limited', open_available: 'Open / Available', actively_collaborate: 'Actively looking to collaborate' } as Record<string, string>)[profile.open_to_connect] || profile.open_to_connect}
          </span>
        </div>
      )}

      {/* Section: Social Links */}
      {SOCIAL_PLATFORMS.filter(({ key }) => profile?.[key]).length > 0 && (
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8FA09A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Connect</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {SOCIAL_PLATFORMS.filter(({ key }) => profile?.[key]).map(({ key, label, Icon }) => {
              const url = profile[key] as string;
              return (
                <a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#2F5D50', textDecoration: 'none' }}>
                  <Icon size={14} />
                  <span style={{ color: '#5F7A74', minWidth: '70px' }}>{label}:</span>
                  <span style={{ color: '#2F5D50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatSocialLink(url)}</span>
                </a>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

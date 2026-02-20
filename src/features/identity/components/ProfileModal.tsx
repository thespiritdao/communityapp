import type React from 'react';
import { useState, useEffect } from 'react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import type { UserProfile } from '@/features/identity/types';
import { DatabaseTokenGallery } from '@/features/identity/components/DatabaseTokenGallery';
import { mapStoredValuesToLabels } from '@/features/identity/utils/formatProfileValues';
import {
  interestsOptions,
  seekingOptions,
} from '@/features/identity/constants/profileOptions';
import FundButton from '@/components/FundButton';
import FundingModal from '@/components/FundingModal';
import { useFundingModal } from '@/hooks/useFundingModal';
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
  Gift,
} from 'lucide-react';
import { DirectMessageModal } from '@/features/chat/components/DirectMessageModal';
import { GiftModal } from '@/features/identity/components/GiftModal';
import { VideoCallModal } from '@/features/chat/components/VideoCallModal';
import { VideoChatService } from '@/features/chat/services/videoChatService';
import '../styles/ProfileModal.css';

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

export const ProfileModal: React.FC<ProfileModalProps> = ({
  user,
  users,
  onClose,
}) => {
  const { evmAddress: address } = useEvmAddress();
  const { modalProps, openMemberFunding } = useFundingModal();
  const profilePictureUrl = getProfilePictureUrl(user.wallet_address, users);
  const [showDMModal, setShowDMModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [videoSessionId, setVideoSessionId] = useState<string | null>(null);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [vpOffset, setVpOffset] = useState({ top: 0, height: '100dvh' });

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const updateVp = () => {
      const vv = window.visualViewport;
      if (vv) setVpOffset({ top: vv.offsetTop, height: `${vv.height}px` });
    };

    updateVp();
    window.visualViewport?.addEventListener('resize', updateVp);
    window.visualViewport?.addEventListener('scroll', updateVp);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.visualViewport?.removeEventListener('resize', updateVp);
      window.visualViewport?.removeEventListener('scroll', updateVp);
    };
  }, []);

  const mappedInterests = mapStoredValuesToLabels(user.interests ?? null, interestsOptions);
  const mappedSeeking = mapStoredValuesToLabels(user.seeking ?? null, seekingOptions);

  const handleFundUser = () => {
    openMemberFunding({
      address: user.wallet_address,
      name: `${user.first_name} ${user.last_name}`,
      image: profilePictureUrl,
      description: `Send funding directly to ${user.first_name}`,
    });
  };

  const canFundUser =
    address && address.toLowerCase() !== user.wallet_address.toLowerCase();

  // Only allow message/gift for OTHER users' profiles (not your own)
  const canInteractWithUser =
    address && address.toLowerCase() !== user.wallet_address.toLowerCase();

  const handleOpenMessage = () => {
    setShowDMModal(true);
  };

  const handleOpenGift = () => {
    setShowGiftModal(true);
  };

  const handleStartVideoCall = async () => {
    if (!address || isStartingCall) return;
    setIsStartingCall(true);
    try {
      const callerName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || address.slice(0, 6);
      const session = await VideoChatService.initiateCall(
        address,
        user.wallet_address,
        callerName,
      );
      setVideoSessionId(session.id);
    } catch (err) {
      console.error('Failed to start video call:', err);
    } finally {
      setIsStartingCall(false);
    }
  };

  return (
    <div
      className="profile-modal-overlay"
      onClick={onClose}
      style={{ top: vpOffset.top, height: vpOffset.height }}
    >
    <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
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

      {/* Section: Basic Info */}
      <div className="profile-section">
        <div className="profile-header">
          <div className="profile-info">
            <h2>{`${user.first_name} ${user.last_name}`}</h2>

            {user.website && (
              <a href={user.website} target="_blank" rel="noopener noreferrer">
                {user.website}
              </a>
            )}

            {/* Action Buttons: Message, Video & Gift */}
            {canInteractWithUser && (
              <div className="profile-action-buttons">
                <button
                  className="action-btn message-btn"
                  onClick={handleOpenMessage}
                >
                  <MessageCircle size={16} />
                  <span>Message</span>
                </button>
                <button
                  className="action-btn video-btn"
                  onClick={handleStartVideoCall}
                  disabled={isStartingCall}
                >
                  <Video size={16} />
                  <span>{isStartingCall ? 'Calling...' : 'Video'}</span>
                </button>
                <button
                  className="action-btn gift-btn"
                  onClick={handleOpenGift}
                >
                  <Gift size={16} />
                  <span>Gift</span>
                </button>
              </div>
            )}

            {user.bio && <p className="user-bio">{user.bio}</p>}
          </div>

          {/* Fund User Button */}
          {canFundUser && (
            <div className="profile-actions">
              <FundButton
                recipientType="member"
                variant="default"
                size="sm"
                onClick={handleFundUser}
              />
            </div>
          )}
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
          {mappedInterests.length > 0 ? (
            <div className="interests-tags">
              {mappedInterests.map((label, i) => (
                <span key={i} className="interest-tag">
                  {label}
                </span>
              ))}
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
          {mappedSeeking.length > 0 ? (
            <div className="interests-tags">
              {mappedSeeking.map((label, i) => (
                <span key={i} className="interest-tag seeking-tag">
                  {label}
                </span>
              ))}
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
              className={`connect-badge ${user.open_to_connect || 'not-specified'}`}
            >
              {{
                low_limited: 'Low / Limited',
                open_available: 'Open / Available',
                actively_collaborate: 'Actively looking to collaborate',
              }[user.open_to_connect || ''] || 'Not specified'}
            </span>
          </div>
        </div>
      </div>

      <hr />

      {/* Section: Tokens */}
      <div className="profile-section token-gallery-modal">
        <h3>Memberships</h3>
        <DatabaseTokenGallery
          walletAddress={user.wallet_address}
          category="membership"
        />

        <h3 style={{ marginTop: '20px' }}>Credentials</h3>
        <DatabaseTokenGallery
          walletAddress={user.wallet_address}
          category="credential"
        />
      </div>

      <hr />

      {/* Section: Social Links (New List Format) */}
      <div className="profile-section">
        <h3>Connect</h3>
        <div className="social-links">
          {SOCIAL_PLATFORMS.filter(
            ({ key }) => user[key as keyof UserProfile],
          ).map(({ key, label, Icon }) => {
            const url = user[key as keyof UserProfile] as string;
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
          {SOCIAL_PLATFORMS.filter(({ key }) => user[key as keyof UserProfile])
            .length === 0 && (
            <p className="interests-empty">No social links added</p>
          )}
        </div>
      </div>

      {/* Funding Modal */}
      {modalProps.recipient && (
        <FundingModal {...modalProps} onSuccess={(amount, token) => {}} />
      )}

      {/* Direct Message Modal */}
      {showDMModal && (
        <DirectMessageModal
          recipientAddress={user.wallet_address}
          recipientName={`${user.first_name} ${user.last_name}`}
          recipientImage={profilePictureUrl}
          onClose={() => setShowDMModal(false)}
        />
      )}

      {/* Gift Modal */}
      {showGiftModal && (
        <GiftModal
          recipientAddress={user.wallet_address}
          recipientName={`${user.first_name} ${user.last_name}`}
          recipientImage={profilePictureUrl}
          onClose={() => setShowGiftModal(false)}
        />
      )}

      {/* Video Call Modal */}
      {videoSessionId && address && (
        <VideoCallModal
          sessionId={videoSessionId}
          localWallet={address}
          remoteUser={user}
          role="initiator"
          onClose={() => setVideoSessionId(null)}
        />
      )}
    </div>
    </div>
  );
};

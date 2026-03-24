import type React from 'react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import type { UserProfile } from '@/features/identity/types';
import { DatabaseTokenGallery } from '@/features/identity/components/DatabaseTokenGallery';
import { mapStoredValuesToLabels } from '@/features/identity/utils/formatProfileValues';
import {
  interestsOptions,
  seekingOptions,
} from '@/features/identity/constants/profileOptions';
import {
  User,
  X,
  ExternalLink,
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
  pods?: { pod_id: string; name: string; membership_type: string }[];
}

const CONNECT_LABELS: Record<string, string> = {
  low_limited: 'Low / Limited',
  open_available: 'Open / Available',
  actively_collaborate: 'Actively Collaborating',
};

const CONNECT_COLORS: Record<string, string> = {
  low_limited: '#8FA09A',
  open_available: '#4A7C6F',
  actively_collaborate: '#2F5D50',
};

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

const getProfilePictureUrl = (walletAddress: string, users: UserProfile[]) => {
  const user = users.find((u) => u.wallet_address === walletAddress);
  if (user?.profile_picture?.startsWith('http')) return user.profile_picture;
  return user?.profile_picture
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${user.profile_picture}`
    : null;
};

export const ProfileModal: React.FC<ProfileModalProps> = ({ user, users, onClose, pods }) => {
  const { evmAddress: address } = useEvmAddress();
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

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Anonymous Member';
  const interests = mapStoredValuesToLabels(user.interests ?? null, interestsOptions);
  const seeking = mapStoredValuesToLabels(user.seeking ?? null, seekingOptions);
  const connectLabel = CONNECT_LABELS[user.open_to_connect || ''];
  const connectColor = CONNECT_COLORS[user.open_to_connect || ''];
  const socials = SOCIAL_PLATFORMS.filter(({ key }) => !!(user as any)[key]);

  const canInteractWithUser =
    address && address.toLowerCase() !== user.wallet_address.toLowerCase();

  const handleStartVideoCall = async () => {
    if (!address || isStartingCall) return;
    setIsStartingCall(true);
    try {
      const callerName = name !== 'Anonymous Member' ? name : address.slice(0, 6);
      const session = await VideoChatService.initiateCall(address, user.wallet_address, callerName);
      setVideoSessionId(session.id);
    } catch (err) {
      console.error('Failed to start video call:', err);
    } finally {
      setIsStartingCall(false);
    }
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#8FA09A',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
  };

  const content = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        top: vpOffset.top,
        height: vpOffset.height,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
          position: 'relative',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', cursor: 'pointer', color: '#8FA09A', display: 'flex', alignItems: 'center' }}
        >
          <X size={20} />
        </button>

        {/* Header: avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#E8F1EE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {profilePictureUrl ? (
              <img src={profilePictureUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <User size={32} color="#6F9E90" />
            )}
          </div>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1A2E28', marginBottom: '4px' }}>{name}</h2>
            {connectLabel && (
              <span style={{ fontSize: '0.8rem', color: connectColor, fontWeight: 600 }}>{connectLabel}</span>
            )}
            {user.website && (
              <a
                href={user.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#4A7C6F', marginTop: '4px', textDecoration: 'none' }}
              >
                <ExternalLink size={12} />
                {user.website.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}
              </a>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {canInteractWithUser && (
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <button
              onClick={() => setShowDMModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', border: 'none', borderRadius: '8px', background: '#2F5D50', color: '#fff', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' }}
            >
              <MessageCircle size={15} />
              Message
            </button>
            <button
              onClick={handleStartVideoCall}
              disabled={isStartingCall}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', border: '1px solid #B8D9CA', borderRadius: '8px', background: '#E8F1EE', color: '#2F5D50', fontSize: '0.9rem', fontWeight: 500, cursor: isStartingCall ? 'not-allowed' : 'pointer', opacity: isStartingCall ? 0.6 : 1 }}
            >
              <Video size={15} />
              {isStartingCall ? 'Calling…' : 'Video'}
            </button>
            <button
              onClick={() => setShowGiftModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', border: 'none', borderRadius: '8px', background: '#8FA09A', color: '#fff', fontSize: '0.9rem', fontWeight: 500, cursor: 'pointer' }}
            >
              <Gift size={15} />
              Gift
            </button>
          </div>
        )}

        {/* Bio */}
        {user.bio && (
          <p style={{ fontSize: '0.9rem', color: '#3A3A3A', lineHeight: 1.6, marginBottom: '1.25rem' }}>{user.bio}</p>
        )}

        {/* Pods */}
        {pods && pods.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={sectionLabel}>Pods</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {pods.map((p) => (
                <span key={p.pod_id} style={{
                  fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px',
                  background: p.membership_type === 'leader' ? '#2F5D50' : '#E8F1EE',
                  color: p.membership_type === 'leader' ? '#fff' : '#2F5D50',
                  fontWeight: 500,
                }}>
                  {p.name}{p.membership_type === 'leader' ? ' · Leader' : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Interests */}
        {interests.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={sectionLabel}>Interests</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {interests.map((label, i) => (
                <span key={i} style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', background: '#F0F5F3', color: '#2F5D50', fontWeight: 500 }}>{label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Seeking */}
        {seeking.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={sectionLabel}>Seeking</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {seeking.map((label, i) => (
                <span key={i} style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '999px', background: '#F9F5F0', color: '#6B5A3E', fontWeight: 500 }}>{label}</span>
              ))}
            </div>
          </div>
        )}

        {/* Tokens */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h3 style={sectionLabel}>Memberships</h3>
          <div className="token-gallery-modal">
            <DatabaseTokenGallery walletAddress={user.wallet_address} category="membership" />
          </div>
          <h3 style={{ ...sectionLabel, marginTop: '1rem' }}>Credentials</h3>
          <div className="token-gallery-modal">
            <DatabaseTokenGallery walletAddress={user.wallet_address} category="credential" />
          </div>
          <h3 style={{ ...sectionLabel, marginTop: '1rem' }}>Accreditations</h3>
          <div className="token-gallery-modal">
            <DatabaseTokenGallery walletAddress={user.wallet_address} category="accreditation" />
          </div>
        </div>

        {/* Socials */}
        {socials.length > 0 && (
          <div>
            <h3 style={sectionLabel}>Connect</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {socials.map(({ key, label, Icon }) => {
                const url = (user as any)[key] as string;
                return (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#2F5D50', textDecoration: 'none' }}>
                    <Icon size={14} />
                    <span style={{ color: '#5F7A74', minWidth: '70px' }}>{label}:</span>
                    <span style={{ color: '#2F5D50', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* Modals */}
        {showDMModal && (
          <DirectMessageModal
            recipientAddress={user.wallet_address}
            recipientName={name}
            recipientImage={profilePictureUrl || '/images/symbolobinfin.png'}
            onClose={() => setShowDMModal(false)}
          />
        )}
        {showGiftModal && (
          <GiftModal
            recipientAddress={user.wallet_address}
            recipientName={name}
            recipientImage={profilePictureUrl || '/images/symbolobinfin.png'}
            onClose={() => setShowGiftModal(false)}
          />
        )}
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

  return createPortal(content, document.body);
};

'use client';

// src/features/chat/components/VideoCallModal.tsx
//
// Full-screen video call modal. Mobile-first — no chat sidebar.
// Handles both initiator and recipient flows.
//
// Initiator flow:  open modal → create session → show "Calling..." → wait for accept → WebRTC
// Recipient flow:  IncomingCallBanner triggers → open modal → accept/decline → WebRTC

import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone } from 'lucide-react';
import { useVideoCall } from '../hooks/useVideoCall';
import type { CallRole } from '../hooks/useVideoCall';
import type { UserProfile } from '@/features/identity/types';

interface VideoCallModalProps {
  sessionId: string;
  localWallet: string;
  remoteUser: UserProfile;
  role: CallRole;
  initialStatus?: 'ringing' | 'accepted';
  onClose: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  ringing: 'Calling...',
  accepted: 'Connecting...',
  active: 'Connected',
  declined: 'Call Declined',
  ended: 'Call Ended',
  missed: 'No Answer',
};

export const VideoCallModal: React.FC<VideoCallModalProps> = ({
  sessionId,
  localWallet,
  remoteUser,
  role,
  initialStatus,
  onClose,
}) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const {
    localStream,
    remoteStream,
    callStatus,
    isAudioMuted,
    isVideoOff,
    toggleAudio,
    toggleVideo,
    endCall,
    acceptCall,
    declineCall,
  } = useVideoCall({
    sessionId,
    localWallet,
    remoteWallet: remoteUser.wallet_address,
    role,
    initialStatus,
    onCallEnded: () => {
      setTimeout(onClose, 1500); // brief pause so user sees "Call Ended"
    },
  });

  // Attach streams to video elements
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  const remoteProfilePic = remoteUser.profile_picture?.startsWith('http')
    ? remoteUser.profile_picture
    : remoteUser.profile_picture
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${remoteUser.profile_picture}`
      : '/images/symbolobinfin.png';

  const remoteName = `${remoteUser.first_name ?? ''} ${remoteUser.last_name ?? ''}`.trim() || 'User';

  const isTerminal = callStatus === 'ended' || callStatus === 'declined' || callStatus === 'missed';
  const isWaiting = role === 'initiator' && (callStatus === 'ringing' || callStatus === 'accepted');
  const showAcceptDecline = role === 'recipient' && callStatus === 'ringing';

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* ── Remote video (full background when active) ── */}
        {remoteStream ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={styles.remoteVideo}
          />
        ) : (
          // Avatar placeholder while waiting / no remote video
          <div style={styles.avatarBg}>
            <img src={remoteProfilePic} alt={remoteName} style={styles.avatarImg} />
          </div>
        )}

        {/* ── Status banner ── */}
        <div style={styles.statusBanner}>
          <span style={styles.remoteName}>{remoteName}</span>
          <span style={styles.statusText}>{STATUS_LABEL[callStatus] ?? callStatus}</span>
        </div>

        {/* ── Local PiP video ── */}
        {localStream && !isVideoOff && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={styles.localPip}
          />
        )}

        {/* ── Controls ── */}
        <div style={styles.controls}>
          {showAcceptDecline ? (
            // Recipient: accept or decline
            <>
              <button
                onClick={declineCall}
                style={{ ...styles.ctrlBtn, ...styles.endBtn }}
                aria-label="Decline call"
              >
                <PhoneOff size={22} />
              </button>
              <button
                onClick={acceptCall}
                style={{ ...styles.ctrlBtn, ...styles.acceptBtn }}
                aria-label="Accept call"
              >
                <Phone size={22} />
              </button>
            </>
          ) : (
            // In-call controls
            <>
              <button
                onClick={toggleAudio}
                style={{ ...styles.ctrlBtn, ...(isAudioMuted ? styles.mutedBtn : {}) }}
                aria-label={isAudioMuted ? 'Unmute' : 'Mute'}
                disabled={isTerminal}
              >
                {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                onClick={toggleVideo}
                style={{ ...styles.ctrlBtn, ...(isVideoOff ? styles.mutedBtn : {}) }}
                aria-label={isVideoOff ? 'Enable camera' : 'Disable camera'}
                disabled={isTerminal}
              >
                {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
              </button>

              <button
                onClick={isTerminal ? onClose : endCall}
                style={{ ...styles.ctrlBtn, ...styles.endBtn }}
                aria-label="End call"
              >
                <PhoneOff size={22} />
              </button>
            </>
          )}
        </div>

        {/* ── Calling/waiting label ── */}
        {isWaiting && (
          <div style={styles.waitingPulse}>
            <div style={styles.pulseRing} />
            <div style={styles.pulseRing2} />
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Styles (inline, SpiritDAO sacred palette) ───────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modal: {
    position: 'relative',
    width: '100%',
    maxWidth: 480,
    aspectRatio: '9/16',
    maxHeight: '90vh',
    background: '#1A2B26',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  remoteVideo: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarBg: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(160deg, #1A2B26 0%, #2F5D50 100%)',
  },
  avatarImg: {
    width: 120,
    height: 120,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid rgba(255,255,255,0.2)',
  },
  statusBanner: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    zIndex: 10,
    padding: '0 16px',
  },
  remoteName: {
    color: '#FFFFFF',
    fontSize: '1.2rem',
    fontWeight: 600,
    textShadow: '0 1px 4px rgba(0,0,0,0.6)',
  },
  statusText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: '0.85rem',
    fontWeight: 400,
    letterSpacing: '0.02em',
  },
  localPip: {
    position: 'absolute',
    top: 80,
    right: 12,
    width: 90,
    height: 120,
    objectFit: 'cover',
    borderRadius: 10,
    border: '2px solid rgba(255,255,255,0.3)',
    zIndex: 10,
  },
  controls: {
    position: 'absolute',
    bottom: 36,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'center',
    gap: 20,
    zIndex: 10,
    padding: '0 24px',
  },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
    transition: 'background 0.2s',
  },
  mutedBtn: {
    background: 'rgba(139,58,58,0.6)', // earthen red — muted state
  },
  endBtn: {
    background: '#8B3A3A', // DESTRUCTIVE — end call
    width: 64,
    height: 64,
  },
  acceptBtn: {
    background: '#3F7A5A', // SUCCESS — accept call
    width: 64,
    height: 64,
  },
  waitingPulse: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  pulseRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: '50%',
    border: '2px solid rgba(47,93,80,0.5)',
    animation: 'vcsPulse 2s ease-out infinite',
  },
  pulseRing2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: '50%',
    border: '2px solid rgba(47,93,80,0.3)',
    animation: 'vcsPulse 2s ease-out infinite 0.6s',
  },
};

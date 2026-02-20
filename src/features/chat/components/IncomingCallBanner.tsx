'use client';

// src/features/chat/components/IncomingCallBanner.tsx
//
// Global listener — mounts once in providers.tsx.
// Subscribes to video_call_sessions where the current user is the recipient.
// When a ringing call arrives, shows a floating banner with Accept / Decline.

import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useEvmAddress } from '@coinbase/cdp-hooks';
import { supabase } from '@/utils/supabaseClient';
import { VideoChatService, type VideoCallSession } from '../services/videoChatService';
import { VideoCallModal } from './VideoCallModal';
import type { UserProfile } from '@/features/identity/types';

export const IncomingCallBanner: React.FC = () => {
  const { evmAddress: address } = useEvmAddress();
  const [incomingCall, setIncomingCall] = useState<VideoCallSession | null>(null);
  const [callerProfile, setCallerProfile] = useState<UserProfile | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load caller's profile when a call arrives
  useEffect(() => {
    if (!incomingCall) {
      setCallerProfile(null);
      return;
    }
    supabase
      .from('user_profiles')
      .select('*')
      .eq('wallet_address', incomingCall.initiator_wallet)
      .single()
      .then(({ data }) => {
        if (data) setCallerProfile(data as UserProfile);
      });
  }, [incomingCall]);

  // Subscribe to incoming calls
  useEffect(() => {
    if (!address) return;

    const normalized = address.toLowerCase();

    const sub = supabase
      .channel(`incoming_calls_${normalized}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_call_sessions',
          filter: `recipient_wallet=eq.${normalized}`,
        },
        (payload) => {
          const session = payload.new as VideoCallSession;
          if (session.status === 'ringing') {
            setIncomingCall(session);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'video_call_sessions',
          filter: `recipient_wallet=eq.${normalized}`,
        },
        (payload) => {
          const session = payload.new as VideoCallSession;
          // If the current banner call was cancelled/missed before answering, dismiss it
          if (
            incomingCall?.id === session.id &&
            (session.status === 'ended' || session.status === 'missed' || session.status === 'declined')
          ) {
            setIncomingCall(null);
          }
        },
      )
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, [address, incomingCall?.id]);

  const handleAccept = () => {
    if (!incomingCall) return;
    setActiveSessionId(incomingCall.id);
    setIncomingCall(null);
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    await VideoChatService.declineCall(incomingCall.id);
    setIncomingCall(null);
  };

  const callerName = callerProfile
    ? `${callerProfile.first_name ?? ''} ${callerProfile.last_name ?? ''}`.trim() || 'Someone'
    : 'Someone';

  const callerPic = callerProfile?.profile_picture?.startsWith('http')
    ? callerProfile.profile_picture
    : callerProfile?.profile_picture
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile_images/${callerProfile.profile_picture}`
      : '/images/symbolobinfin.png';

  return (
    <>
      {/* ── Incoming call banner ── */}
      {incomingCall && callerProfile && (
        <div style={styles.banner}>
          <div style={styles.callerInfo}>
            <img src={callerPic} alt={callerName} style={styles.callerAvatar} />
            <div>
              <div style={styles.callerName}>{callerName}</div>
              <div style={styles.callerSub}>Incoming video call</div>
            </div>
          </div>
          <div style={styles.bannerActions}>
            <button
              onClick={handleDecline}
              style={{ ...styles.bannerBtn, ...styles.declineBtn }}
              aria-label="Decline"
            >
              <PhoneOff size={18} />
            </button>
            <button
              onClick={handleAccept}
              style={{ ...styles.bannerBtn, ...styles.answerBtn }}
              aria-label="Accept"
            >
              <Phone size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ── Active call modal (after accepting) ── */}
      {activeSessionId && callerProfile && address && (
        <VideoCallModal
          sessionId={activeSessionId}
          localWallet={address}
          remoteUser={callerProfile}
          role="recipient"
          onClose={() => setActiveSessionId(null)}
        />
      )}
    </>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  banner: {
    position: 'fixed',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 'calc(100% - 32px)',
    maxWidth: 400,
    background: '#1A2B26',
    borderRadius: 14,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    zIndex: 3000,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    border: '1px solid rgba(47,93,80,0.4)',
  },
  callerInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  callerAvatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    objectFit: 'cover',
    flexShrink: 0,
    border: '2px solid rgba(255,255,255,0.15)',
  },
  callerName: {
    color: '#FFFFFF',
    fontSize: '0.95rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  callerSub: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '0.78rem',
    marginTop: 2,
  },
  bannerActions: {
    display: 'flex',
    gap: 10,
    flexShrink: 0,
  },
  bannerBtn: {
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#FFFFFF',
  },
  declineBtn: {
    background: '#8B3A3A', // DESTRUCTIVE
  },
  answerBtn: {
    background: '#3F7A5A', // SUCCESS
  },
};

'use client';

// src/features/chat/components/IncomingCallBanner.tsx
//
// Global listener — mounts once in providers.tsx.
// Subscribes to video_call_sessions where the current user is the recipient.
// When a ringing call arrives, shows a floating banner with Accept / Decline.

import React, { useState, useEffect, useRef } from 'react';
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
  // Holds the caller profile across the banner→modal transition so clearing
  // incomingCall doesn't wipe the profile before the modal can mount.
  const activeCallerRef = useRef<UserProfile | null>(null);

  // Load caller's profile when a call arrives
  useEffect(() => {
    if (!incomingCall) {
      // Only clear the displayed profile if we're not in an active call
      if (!activeSessionId) setCallerProfile(null);
      return;
    }
    supabase
      .from('public_profiles')
      .select('wallet_address, first_name, last_name, profile_picture')
      .eq('wallet_address', incomingCall.initiator_wallet)
      .single()
      .then(({ data }) => {
        if (data) {
          setCallerProfile(data as UserProfile);
          activeCallerRef.current = data as UserProfile;
        }
      });
  }, [incomingCall, activeSessionId]);

  // Subscribe to incoming calls via Broadcast (instant, no DB-write latency)
  useEffect(() => {
    if (!address) return;

    const normalized = address.toLowerCase();

    // Primary: Broadcast channel — fires the moment the caller calls initiateCall()
    const broadcastSub = supabase
      .channel(`call:${normalized}`)
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => {
        const session = payload as VideoCallSession;
        if (session.status === 'ringing') {
          setIncomingCall(session);
        }
      })
      .subscribe();

    // Secondary: postgres_changes UPDATE — to dismiss banner if caller cancels before answer
    const updateSub = supabase
      .channel(`incoming_calls_update_${normalized}`)
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
          if (
            incomingCall?.id === session.id &&
            (session.status === 'ended' || session.status === 'missed' || session.status === 'declined')
          ) {
            setIncomingCall(null);
          }
        },
      )
      .subscribe();

    return () => {
      broadcastSub.unsubscribe();
      updateSub.unsubscribe();
    };
  }, [address, incomingCall?.id]);

  const handleAccept = async () => {
    if (!incomingCall) return;
    const sessionId = incomingCall.id;
    // Snapshot the caller profile before clearing incomingCall
    activeCallerRef.current = callerProfile;
    // Persist accept to DB
    await VideoChatService.acceptCall(sessionId);
    // Broadcast accepted on the signaling channel so the initiator's modal
    // receives it instantly via Broadcast (even if postgres_changes is slow)
    supabase.channel(`signal:${sessionId}`).send({
      type: 'broadcast',
      event: 'accepted',
      payload: { from: address?.toLowerCase() },
    });
    // Set active session — triggers the VideoCallModal to mount
    setActiveSessionId(sessionId);
    // Clear the banner after modal is queued to render
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
      {activeSessionId && address && (activeCallerRef.current ?? callerProfile) && (
        <VideoCallModal
          sessionId={activeSessionId}
          localWallet={address}
          remoteUser={(activeCallerRef.current ?? callerProfile)!}
          role="recipient"
          initialStatus="accepted"
          onClose={() => {
            setActiveSessionId(null);
            activeCallerRef.current = null;
            setCallerProfile(null);
          }}
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

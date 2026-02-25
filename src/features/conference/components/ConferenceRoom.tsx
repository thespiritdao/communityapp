'use client';

// src/features/conference/components/ConferenceRoom.tsx
//
// Root component for a multi-person conference room.
// Layout (mobile-first, 9:16):
//
//  ┌─────────────────────────┐
//  │  [room name]    [people] │  ← header
//  │                          │
//  │    DOMINANT SPEAKER      │  ← SpeakerView (full bg)
//  │                          │
//  │  👏 ❤️ 😂 😮 ✋          │  ← ReactionBar
//  ├─────────────────────────┤
//  │  [p1] [p2] [p3] [p4]…  │  ← thumbnail strip
//  ├─────────────────────────┤
//  │  🎤  📷  ✋  ⚙️  🚪      │  ← controls
//  └─────────────────────────┘
//  [floating reactions overlay]
//  [host panel slide-up]

import React, { useState, useCallback, useEffect } from 'react';
import { ConnectionState } from 'livekit-client';
import {
  Mic, MicOff, Video, VideoOff,
  Hand, Settings, LogOut, Users, Loader2,
} from 'lucide-react';
import { useConferenceRoom }  from '../hooks/useConferenceRoom';
import { useReactions }       from '../hooks/useReactions';
import { SpeakerView }        from './SpeakerView';
import { ParticipantTile }    from './ParticipantTile';
import { FloatingReactions }  from './FloatingReactions';
import { ReactionBar }        from './ReactionBar';
import { HostControls }       from './HostControls';
import { setHandRaised }      from '../services/conferenceService';
import type { ConferenceRoom as ConferenceRoomType, ParticipantRole } from '../types/conference';

interface ConferenceRoomProps {
  room: ConferenceRoomType;
  walletAddress: string;
  requestedRole?: ParticipantRole;
  onLeave: () => void;
}

export const ConferenceRoom: React.FC<ConferenceRoomProps> = ({
  room,
  walletAddress,
  requestedRole = 'attendee',
  onLeave,
}) => {
  const [showHostPanel, setShowHostPanel] = useState(false);
  const [handRaised, setLocalHandRaised] = useState(false);
  // wallet → display name map, fetched once per unique wallet seen
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  const {
    connectionState,
    isConnecting,
    isConnected,
    error,
    localParticipant,
    remoteParticipants,
    dominantSpeaker,
    role,
    canPublish,
    dbParticipants,
    isAudioMuted,
    isVideoOff,
    toggleAudio,
    toggleVideo,
    join,
    leave,
    identity,
  } = useConferenceRoom({ room, walletAddress, requestedRole, onMeetingEnded: onLeave });

  // Use server-assigned identity for all participant actions (JWT wallet, not EVM address)
  const { floatingReactions, sendReaction } = useReactions(room.room_name, identity);

  // Fetch display names for all participants we haven't resolved yet
  useEffect(() => {
    const wallets = [
      ...dbParticipants.map(p => p.wallet_address),
      identity,
    ].filter(Boolean).map(w => w.toLowerCase());

    const unseen = wallets.filter(w => !(w in nameMap));
    if (unseen.length === 0) return;

    unseen.forEach(w => {
      fetch(`/api/conference/participant-name?wallet=${encodeURIComponent(w)}`)
        .then(r => r.json())
        .then(({ name }) => {
          const display = name || `${w.slice(0, 6)}…${w.slice(-4)}`;
          setNameMap(prev => ({ ...prev, [w]: display }));
        })
        .catch(() => {
          setNameMap(prev => ({ ...prev, [w]: `${w.slice(0, 6)}…${w.slice(-4)}` }));
        });
    });
  }, [dbParticipants, identity]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve dominant speaker role from DB participants
  const dominantDbParticipant = dbParticipants.find(
    p => p.wallet_address === dominantSpeaker?.identity
  );

  // Raise/lower hand
  const toggleHand = useCallback(async () => {
    const next = !handRaised;
    setLocalHandRaised(next);
    await setHandRaised(room.id, identity, next).catch(console.error);
  }, [handRaised, room.id, identity]);

  const handleLeave = useCallback(async () => {
    await leave();
    onLeave();
  }, [leave, onLeave]);

  const isHost   = role === 'host' || role === 'co_host';
  const isSpeaker = role === 'speaker';

  // ── Pre-join screen ────────────────────────────────────────────────────────
  if (connectionState === ConnectionState.Disconnected && !isConnecting) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.prejoinContent}>
            <div style={styles.roomTitle}>{room.display_name}</div>
            <div style={styles.roomMeta}>
              {room.status === 'live'
                ? '🔴 Meeting in progress'
                : '🕐 Meeting not started yet'}
            </div>
            {error && <div style={styles.errorText}>{error}</div>}
            <button onClick={join} style={styles.joinBtn}>
              {role === 'host' ? 'Start Meeting' : 'Join Meeting'}
            </button>
            <button onClick={onLeave} style={styles.cancelBtn}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Connecting spinner ─────────────────────────────────────────────────────
  if (isConnecting) {
    return (
      <div style={styles.overlay}>
        <div style={styles.modal}>
          <div style={styles.prejoinContent}>
            <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#3F7A5A' }} />
            <div style={{ color: 'rgba(255,255,255,0.7)', marginTop: 16 }}>Joining meeting…</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Active room ────────────────────────────────────────────────────────────
  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>

        {/* ── Dominant speaker (full background) ── */}
        <SpeakerView
          dominant={dominantSpeaker}
          localParticipant={localParticipant}
          speakerRole={dominantDbParticipant?.role}
          nameMap={nameMap}
        />

        {/* ── Floating emoji reactions ── */}
        <FloatingReactions reactions={floatingReactions} />

        {/* ── Top header ── */}
        <div style={styles.topBar}>
          <span style={styles.roomName}>{room.display_name}</span>
          <div style={styles.topRight}>
            <span style={styles.participantCount}>
              <Users size={13} style={{ marginRight: 4 }} />
              {dbParticipants.filter(p => p.is_active).length}
            </span>
            {isConnected && (
              <span style={styles.liveTag}>🔴 LIVE</span>
            )}
          </div>
        </div>

        {/* ── Reaction bar (above controls) ── */}
        <div style={styles.reactionBarWrap}>
          <ReactionBar onReact={sendReaction} disabled={!isConnected} />
        </div>

        {/* ── Thumbnail strip (remote participants) ── */}
        {remoteParticipants.length > 0 && (
          <div style={styles.thumbnailStrip}>
            {remoteParticipants.map(p => {
              const dbP = dbParticipants.find(d => d.wallet_address === p.identity);
              const isSpeaking = dominantSpeaker?.identity === p.identity;
              return (
                <ParticipantTile
                  key={p.identity}
                  participant={p}
                  role={dbP?.role}
                  isSpeaking={isSpeaking}
                  size="thumb"
                  nameMap={nameMap}
                />
              );
            })}
            {/* Local PiP at end of strip */}
            {localParticipant && (
              <ParticipantTile
                key="local"
                participant={localParticipant}
                role={role}
                isSpeaking={false}
                size="thumb"
                nameMap={nameMap}
              />
            )}
          </div>
        )}

        {/* ── Controls ── */}
        <div style={styles.controls}>
          {/* Mute — only for speakers/hosts */}
          {(canPublish || isSpeaker) && (
            <CtrlBtn
              onClick={toggleAudio}
              active={isAudioMuted}
              ariaLabel={isAudioMuted ? 'Unmute' : 'Mute'}
              activeColor="rgba(139,58,58,0.8)"
            >
              {isAudioMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </CtrlBtn>
          )}

          {/* Camera — only for speakers/hosts */}
          {(canPublish || isSpeaker) && (
            <CtrlBtn
              onClick={toggleVideo}
              active={isVideoOff}
              ariaLabel={isVideoOff ? 'Start camera' : 'Stop camera'}
              activeColor="rgba(139,58,58,0.8)"
            >
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </CtrlBtn>
          )}

          {/* Raise hand — attendees only */}
          {!canPublish && role === 'attendee' && (
            <CtrlBtn
              onClick={toggleHand}
              active={handRaised}
              ariaLabel={handRaised ? 'Lower hand' : 'Raise hand'}
              activeColor="rgba(180,140,40,0.8)"
            >
              <Hand size={20} />
            </CtrlBtn>
          )}

          {/* Host panel */}
          {isHost && (
            <CtrlBtn
              onClick={() => setShowHostPanel(v => !v)}
              active={showHostPanel}
              ariaLabel="Manage participants"
              activeColor="rgba(47,93,80,0.8)"
            >
              <Settings size={20} />
            </CtrlBtn>
          )}

          {/* Leave */}
          <CtrlBtn
            onClick={handleLeave}
            ariaLabel="Leave meeting"
            activeColor="rgba(139,58,58,0.8)"
            isDestructive
          >
            <LogOut size={20} />
          </CtrlBtn>
        </div>

        {/* ── Host controls panel (slide-up) ── */}
        {showHostPanel && isHost && (
          <HostControls
            roomName={room.room_name}
            participants={dbParticipants}
            callerWallet={identity}
            callerRole={role}
            onClose={() => setShowHostPanel(false)}
            onEndMeeting={onLeave}
          />
        )}

      </div>
    </div>
  );
};

// ── Control button primitive ──────────────────────────────────────────────────

const CtrlBtn: React.FC<{
  children: React.ReactNode;
  onClick: () => void;
  ariaLabel: string;
  active?: boolean;
  activeColor?: string;
  isDestructive?: boolean;
}> = ({ children, onClick, ariaLabel, active = false, activeColor, isDestructive = false }) => (
  <button
    onClick={onClick}
    aria-label={ariaLabel}
    title={ariaLabel}
    style={{
      width: isDestructive ? 60 : 52,
      height: isDestructive ? 60 : 52,
      borderRadius: '50%',
      border: 'none',
      background: isDestructive
        ? '#8B3A3A'
        : active
          ? (activeColor ?? 'rgba(255,255,255,0.25)')
          : 'rgba(255,255,255,0.12)',
      color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      backdropFilter: 'blur(4px)',
      transition: 'background 0.15s, transform 0.1s',
      flexShrink: 0,
    }}
  >
    {children}
  </button>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.9)',
    zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    position: 'relative',
    width: '100%', maxWidth: 480,
    aspectRatio: '9/16', maxHeight: '95vh',
    background: '#0D1F1A',
    borderRadius: 16,
    overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
  },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'linear-gradient(rgba(0,0,0,0.55), transparent)',
    zIndex: 20,
    pointerEvents: 'none',
  },
  roomName: {
    color: '#fff', fontWeight: 600, fontSize: '0.95rem',
    textShadow: '0 1px 4px rgba(0,0,0,0.7)',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    maxWidth: '60%',
  },
  topRight: {
    display: 'flex', alignItems: 'center', gap: 8,
    pointerEvents: 'auto',
  },
  participantCount: {
    color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem',
    display: 'flex', alignItems: 'center',
    background: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: '2px 8px',
  },
  liveTag: {
    fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em',
    background: 'rgba(139,58,58,0.7)', color: '#fff',
    borderRadius: 4, padding: '2px 6px',
  },
  reactionBarWrap: {
    position: 'absolute',
    bottom: 104, left: 0, right: 0,
    zIndex: 20,
    padding: '0 8px',
  },
  thumbnailStrip: {
    position: 'absolute',
    bottom: 88, left: 0, right: 0,
    display: 'flex', gap: 6,
    overflowX: 'auto', overflowY: 'hidden',
    padding: '0 12px',
    scrollbarWidth: 'none',
    zIndex: 15,
  },
  controls: {
    position: 'absolute',
    bottom: 20, left: 0, right: 0,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    gap: 14,
    zIndex: 20,
    padding: '0 24px',
  },
  prejoinContent: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 16,
    height: '100%', padding: '24px',
    color: '#fff',
  },
  roomTitle: {
    fontSize: '1.3rem', fontWeight: 700, textAlign: 'center',
    color: '#fff',
  },
  roomMeta: {
    color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem',
  },
  errorText: {
    color: '#ff8080', fontSize: '0.85rem', textAlign: 'center',
  },
  joinBtn: {
    padding: '14px 40px', borderRadius: 30, border: 'none',
    background: '#3F7A5A', color: '#fff',
    fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
    marginTop: 8,
  },
  cancelBtn: {
    padding: '10px 32px', borderRadius: 30,
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'transparent', color: 'rgba(255,255,255,0.6)',
    fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer',
  },
};

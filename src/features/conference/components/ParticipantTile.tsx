'use client';

// src/features/conference/components/ParticipantTile.tsx

import React, { useEffect, useRef } from 'react';
import { Participant, Track } from 'livekit-client';
import { Mic, MicOff, Crown, Shield } from 'lucide-react';
import type { ParticipantRole } from '../types/conference';

interface ParticipantTileProps {
  participant: Participant;
  role?: ParticipantRole;
  isSpeaking?: boolean;
  size?: 'thumb' | 'full';
  nameMap: Record<string, string>;
}

const ROLE_ICON: Partial<Record<ParticipantRole, React.ReactNode>> = {
  host:    <Crown    size={10} className="text-yellow-400" />,
  co_host: <Shield  size={10} className="text-blue-400"   />,
};

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  role,
  isSpeaking = false,
  size = 'thumb',
  nameMap,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoTrack = participant.getTrackPublication(Track.Source.Camera)?.videoTrack;
    if (videoRef.current && videoTrack) {
      videoTrack.attach(videoRef.current);
      return () => { videoTrack.detach(videoRef.current!); };
    }
  }, [participant]);

  const hasVideo = !!participant.getTrackPublication(Track.Source.Camera)?.isSubscribed;
  const isMuted  = !participant.getTrackPublication(Track.Source.Microphone)?.isMuted === false;

  const identity = participant.identity?.toLowerCase() ?? '';
  const displayName = nameMap[identity] || (identity ? `${identity.slice(0, 6)}…${identity.slice(-4)}` : '');
  const shortName = displayName.slice(0, 16);

  const isThumb = size === 'thumb';

  return (
    <div
      style={{
        position: 'relative',
        width:  isThumb ? 72  : '100%',
        height: isThumb ? 96  : '100%',
        borderRadius: isThumb ? 10 : 0,
        overflow: 'hidden',
        flexShrink: 0,
        background: '#1A2B26',
        border: isSpeaking
          ? '2px solid rgba(100,220,150,0.85)'
          : '2px solid rgba(255,255,255,0.08)',
        transition: 'border-color 0.15s ease',
        boxShadow: isSpeaking ? '0 0 12px rgba(100,220,150,0.4)' : 'none',
      }}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(160deg, #1A2B26 0%, #2F5D50 100%)',
        }}>
          <div style={{
            width: isThumb ? 32 : 64,
            height: isThumb ? 32 : 64,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: isThumb ? '0.65rem' : '1.2rem',
            fontWeight: 600,
          }}>
            {shortName.slice(0, 2).toUpperCase()}
          </div>
        </div>
      )}

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
        padding: isThumb ? '8px 4px 4px' : '16px 8px 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
      }}>
        <span style={{
          color: '#fff', fontSize: isThumb ? '0.6rem' : '0.8rem',
          fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 3,
        }}>
          {role && ROLE_ICON[role]}
          {shortName}
        </span>
        {isMuted
          ? <MicOff size={isThumb ? 9 : 12}  style={{ color: 'rgba(255,80,80,0.9)',   flexShrink: 0 }} />
          : <Mic    size={isThumb ? 9 : 12}  style={{ color: 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
        }
      </div>
    </div>
  );
};

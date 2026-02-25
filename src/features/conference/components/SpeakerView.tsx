'use client';

// src/features/conference/components/SpeakerView.tsx

import React, { useEffect, useRef } from 'react';
import { Participant, Track, LocalParticipant } from 'livekit-client';
import { Crown, Shield } from 'lucide-react';
import type { ParticipantRole } from '../types/conference';

interface SpeakerViewProps {
  dominant: Participant | null;
  localParticipant: LocalParticipant | null;
  speakerRole?: ParticipantRole;
  nameMap: Record<string, string>;
}

const ROLE_LABEL: Partial<Record<ParticipantRole, React.ReactNode>> = {
  host:    <><Crown  size={12} className="inline mr-1 text-yellow-400" />Host</>,
  co_host: <><Shield size={12} className="inline mr-1 text-blue-400"  />Co-host</>,
};

export const SpeakerView: React.FC<SpeakerViewProps> = ({
  dominant,
  localParticipant,
  speakerRole,
  nameMap,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const displayed: Participant | null = dominant ?? localParticipant;

  useEffect(() => {
    if (!displayed || !videoRef.current) return;
    const pub = displayed.getTrackPublication(Track.Source.Camera);
    const track = pub?.videoTrack;
    if (track) {
      track.attach(videoRef.current);
      return () => { if (videoRef.current) track.detach(videoRef.current); };
    }
  }, [displayed]);

  const hasVideo = !!displayed?.getTrackPublication(Track.Source.Camera)?.videoTrack;

  const identity = displayed?.identity?.toLowerCase() ?? '';
  const displayName = nameMap[identity] || (identity ? `${identity.slice(0, 6)}…${identity.slice(-4)}` : '');
  console.log('🎤 SpeakerView — identity:', identity, 'nameMap keys:', Object.keys(nameMap), 'displayName:', displayName);

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0D1F1A' }}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={displayed instanceof LocalParticipant}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(160deg, #0D1F1A 0%, #1A3D32 50%, #0D1F1A 100%)',
        }}>
          <div style={{
            width: 110, height: 110, borderRadius: '50%',
            background: 'rgba(47,93,80,0.4)',
            border: '2px solid rgba(100,220,150,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '2rem', fontWeight: 700,
          }}>
            {displayName.slice(0, 2).toUpperCase() || '?'}
          </div>
        </div>
      )}

      {displayName && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
          padding: '32px 20px 12px',
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              color: '#fff', fontSize: '1.05rem', fontWeight: 600,
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            }}>
              {displayName}
              {displayed instanceof LocalParticipant && (
                <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginLeft: 6 }}>
                  (You)
                </span>
              )}
            </span>
            {speakerRole && ROLE_LABEL[speakerRole] && (
              <span style={{
                color: 'rgba(255,255,255,0.75)', fontSize: '0.72rem',
                background: 'rgba(255,255,255,0.1)', borderRadius: 4,
                padding: '1px 6px', display: 'flex', alignItems: 'center',
              }}>
                {ROLE_LABEL[speakerRole]}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

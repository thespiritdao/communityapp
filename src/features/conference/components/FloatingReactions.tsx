'use client';

// src/features/conference/components/FloatingReactions.tsx
//
// Renders floating emoji reactions that animate upward and fade out.
// Positioned as a full-overlay pointer-events-none layer so it never
// blocks video or controls.

import React from 'react';
import type { FloatingReaction, ReactionEmoji } from '../types/conference';

const EMOJI_MAP: Record<ReactionEmoji, string> = {
  clap:       '👏',
  heart:      '❤️',
  laugh:      '😂',
  wow:        '😮',
  raise_hand: '✋',
};

interface FloatingReactionsProps {
  reactions: FloatingReaction[];
}

export const FloatingReactions: React.FC<FloatingReactionsProps> = ({ reactions }) => {
  if (reactions.length === 0) return null;

  return (
    <>
      {/* Keyframe injection — only once */}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0)     scale(1);   opacity: 1;   }
          60%  { transform: translateY(-140px) scale(1.3); opacity: 0.9; }
          100% { transform: translateY(-240px) scale(1);   opacity: 0;   }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 40,
          overflow: 'hidden',
        }}
      >
        {reactions.map((r) => (
          <div
            key={r.id}
            style={{
              position: 'absolute',
              bottom: '18%',
              left: `${r.x}%`,
              transform: 'translateX(-50%)',
              fontSize: '2rem',
              lineHeight: 1,
              animation: 'floatUp 2.5s ease-out forwards',
              willChange: 'transform, opacity',
              userSelect: 'none',
            }}
          >
            {EMOJI_MAP[r.emoji]}
          </div>
        ))}
      </div>
    </>
  );
};

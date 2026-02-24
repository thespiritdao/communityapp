'use client';

// src/features/conference/components/ReactionBar.tsx
//
// Five emoji reaction buttons. Tapping one broadcasts to all participants
// and spawns a local floating reaction immediately (optimistic).

import React from 'react';
import type { ReactionEmoji } from '../types/conference';

const REACTIONS: { emoji: ReactionEmoji; label: string; glyph: string }[] = [
  { emoji: 'clap',       label: 'Clap',       glyph: '👏' },
  { emoji: 'heart',      label: 'Love',       glyph: '❤️' },
  { emoji: 'laugh',      label: 'Laugh',      glyph: '😂' },
  { emoji: 'wow',        label: 'Wow',        glyph: '😮' },
  { emoji: 'raise_hand', label: 'Raise hand', glyph: '✋' },
];

interface ReactionBarProps {
  onReact: (emoji: ReactionEmoji) => void;
  disabled?: boolean;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({ onReact, disabled = false }) => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: 10,
      padding: '6px 0',
    }}>
      {REACTIONS.map(({ emoji, label, glyph }) => (
        <button
          key={emoji}
          onClick={() => !disabled && onReact(emoji)}
          disabled={disabled}
          aria-label={label}
          title={label}
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.1)',
            backdropFilter: 'blur(4px)',
            fontSize: '1.25rem',
            cursor: disabled ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s, transform 0.1s',
            opacity: disabled ? 0.4 : 1,
            lineHeight: 1,
          }}
          onMouseDown={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.88)';
          }}
          onMouseUp={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
          onTouchStart={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.88)';
          }}
          onTouchEnd={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          {glyph}
        </button>
      ))}
    </div>
  );
};

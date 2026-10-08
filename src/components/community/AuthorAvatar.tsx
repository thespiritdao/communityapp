'use client';

// One avatar for every person shown in chat, forum and member lists: their
// picture when they have one, otherwise the first letter of their name on the
// sage wash. Replaces three different fallbacks (SpiritDAO symbol, grey
// initial, generic person icon).

import { useState } from 'react';
import styles from './community.module.css';

export interface AuthorAvatarProps {
  /** Display name; its first letter is the fallback. */
  name: string;
  src?: string | null;
  size?: number;
  onClick?: () => void;
  className?: string;
}

export function initialOf(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  // A wallet shown as "0x12ab…" should not render as "0".
  if (/^0x[0-9a-f]/i.test(trimmed)) return trimmed.charAt(2).toUpperCase();
  return trimmed.charAt(0).toUpperCase();
}

export function AuthorAvatar({ name, src, size = 40, onClick, className }: AuthorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const clickable = onClick ? styles.clickable : '';
  const dims = { width: size, height: size };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={onClick}
        className={`${styles.avatar} ${clickable} ${className ?? ''}`}
        style={dims}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      onClick={onClick}
      className={`${styles.avatarFallback} ${clickable} ${className ?? ''}`}
      style={{ ...dims, fontSize: Math.max(10, Math.round(size * 0.4)) }}
    >
      {initialOf(name)}
    </div>
  );
}

export default AuthorAvatar;

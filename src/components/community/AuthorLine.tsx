'use client';

// Who said it and when, the same way everywhere: avatar, name, time. The
// visible time is relative ("3 hours ago") in the forum and clock time
// ("3:42 PM") in chat, where day dividers already carry the date; hovering
// shows the full date and time in both.

import { formatDistanceToNow } from 'date-fns';
import { AuthorAvatar } from './AuthorAvatar';
import styles from './community.module.css';

export type AuthorTimeFormat = 'relative' | 'clock';

export interface AuthorLineProps {
  name: string;
  avatarSrc?: string | null;
  timestamp?: string | Date | null;
  timeFormat?: AuthorTimeFormat;
  /** 0 hides the avatar (e.g. chat, where the avatar sits beside the bubble). */
  avatarSize?: number;
  compact?: boolean;
  onAuthorClick?: () => void;
  className?: string;
}

export function formatAuthorTime(
  timestamp: string | Date | null | undefined,
  format: AuthorTimeFormat,
): { label: string; full: string } | null {
  if (!timestamp) return null;
  const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  if (Number.isNaN(d.getTime())) return null;
  const full = d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const label =
    format === 'clock'
      ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : formatDistanceToNow(d, { addSuffix: true });
  return { label, full };
}

/** "Ada Lovelace", or a shortened wallet when the member has no name. */
export function displayNameOf(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined,
  wallet?: string | null,
): string {
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (wallet) return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  return 'Member';
}

export function AuthorLine({
  name,
  avatarSrc,
  timestamp,
  timeFormat = 'relative',
  avatarSize = 32,
  compact = false,
  onAuthorClick,
  className,
}: AuthorLineProps) {
  const time = formatAuthorTime(timestamp, timeFormat);
  const nameClass = `${styles.authorName} ${compact ? styles.authorNameCompact : ''} ${
    onAuthorClick ? styles.clickable : ''
  }`;

  return (
    <div className={`${styles.authorLine} ${className ?? ''}`}>
      {avatarSize > 0 && (
        <AuthorAvatar name={name} src={avatarSrc} size={avatarSize} onClick={onAuthorClick} />
      )}
      <div className={styles.authorText}>
        <span className={nameClass} onClick={onAuthorClick}>
          {name}
        </span>
        {time && (
          <time
            className={styles.authorTime}
            dateTime={new Date(timestamp as string | Date).toISOString()}
            title={time.full}
          >
            {time.label}
          </time>
        )}
      </div>
    </div>
  );
}

export default AuthorLine;

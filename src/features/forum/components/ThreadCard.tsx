// src/features/forum/components/ThreadCard.tsx
'use client';

import type React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Eye, CheckCircle } from 'lucide-react';
import { BookmarkButton } from './BookmarkButton';
import { AuthorAvatar, communityStyles } from '@/components/community';

let styles: any = {};
try {
  styles = require('../styles/Forum.module.css');
} catch (error) {
  console.warn('Failed to load Forum.module.css, using fallback styles');
  styles = {};
}

interface Thread {
  id: string;
  title: string;
  author_wallet: string;
  author_first_name: string | null;
  author_last_name: string | null;
  author_profile_picture?: string | null;
  created_at: string;
  post_count?: number;
  reply_count?: number;
  view_count?: number;
  last_reply_at?: string | null;
  is_resolved?: boolean;
  is_pinned?: boolean;
  category_name?: string;
  pod_name?: string | null;
  tags?: string[];
  is_bookmarked?: boolean;
  is_unread?: boolean;
}

interface ThreadCardProps {
  thread: Thread;
  onTagClick?: (tag: string) => void;
}

const ThreadCard: React.FC<ThreadCardProps> = ({ thread, onTagClick }) => {
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Invalid date';
    }
  };

  const getAuthorDisplayName = () => {
    const { author_first_name, author_last_name, author_wallet } = thread;
    if (author_first_name && author_last_name) return `${author_first_name} ${author_last_name}`;
    if (author_first_name) return author_first_name;
    if (author_last_name) return author_last_name;
    return author_wallet ? author_wallet.slice(0, 6) + '...' + author_wallet.slice(-4) : 'Anon.';
  };

  const replyCount = thread.reply_count ?? thread.post_count ?? 0;
  const viewCount = thread.view_count ?? 0;

  return (
    <Link
      href={`/forum/thread/${thread.id}`}
      className={communityStyles.listCard}
      style={{ display: 'block', padding: '14px 16px', position: 'relative' }}
    >
      {/* Unread dot */}
      {thread.is_unread && (
        <div style={{
          position: 'absolute',
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: 'var(--cs-primary)',
        }} />
      )}

      {/* Bookmark button — top right */}
      <div style={{ position: 'absolute', top: 10, right: 10 }} onClick={(e) => e.preventDefault()}>
        <BookmarkButton threadId={thread.id} initialBookmarked={thread.is_bookmarked} size={16} />
      </div>

      {/* Title row: badges + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingRight: 32 }}>
        {thread.is_pinned && <span style={{ fontSize: '0.8rem' }}>📌</span>}
        {thread.is_resolved && (
          <CheckCircle size={14} style={{ color: 'var(--cs-primary)', flexShrink: 0 }} />
        )}
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--cs-text)' }}>
          {thread.title}
        </h3>
        {thread.pod_name && (
          <span className={communityStyles.badge}>{thread.pod_name}</span>
        )}
        {thread.category_name && (
          <Badge variant="outline" style={{ fontSize: '0.65rem', padding: '1px 7px' }}>
            {thread.category_name}
          </Badge>
        )}
      </div>

      {/* Tags */}
      {thread.tags && thread.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {thread.tags.map((tag) => (
            <span
              key={tag}
              onClick={(e) => {
                if (onTagClick) { e.preventDefault(); e.stopPropagation(); onTagClick(tag); }
              }}
              style={{
                fontSize: '0.65rem',
                padding: '1px 8px',
                borderRadius: 12,
                backgroundColor: 'var(--cs-cream)',
                color: 'var(--cs-brown)',
                border: '1px solid var(--cs-tan)',
                cursor: onTagClick ? 'pointer' : 'default',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Meta row: author + stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        fontSize: '0.78rem',
      }}>
        {/* Author */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AuthorAvatar name={getAuthorDisplayName()} src={thread.author_profile_picture} size={22} />
          <span style={{ color: 'var(--cs-ink)', fontWeight: 500 }}>{getAuthorDisplayName()}</span>
          <span style={{ color: 'var(--cs-meta)' }} title={new Date(thread.created_at).toLocaleString()}>
            {formatDate(thread.created_at)}
          </span>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--cs-meta)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <MessageSquare size={13} />
            {replyCount}
          </span>
          {viewCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Eye size={13} />
              {viewCount}
            </span>
          )}
          {thread.last_reply_at && (
            <span style={{ fontSize: '0.7rem' }}>
              last reply {formatDate(thread.last_reply_at)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ThreadCard;

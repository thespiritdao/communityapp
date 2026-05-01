// src/features/forum/components/ThreadCard.tsx
'use client';

import type React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Eye, CheckCircle } from 'lucide-react';
import { BookmarkButton } from './BookmarkButton';

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
      style={{
        display: 'block',
        padding: '14px 16px',
        borderRadius: '10px',
        backgroundColor: '#ffffff',
        border: '1px solid rgba(209,196,169,0.4)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.2s, transform 0.15s',
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.transform = 'none';
      }}
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
          backgroundColor: '#3B82F6',
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
          <CheckCircle size={14} style={{ color: '#2F5D50', flexShrink: 0 }} />
        )}
        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: '#212121' }}>
          {thread.title}
        </h3>
        {thread.pod_name && (
          <Badge variant="secondary" style={{
            fontSize: '0.65rem', padding: '1px 7px',
            backgroundColor: '#E8F1EE', color: '#2F5D50', border: '1px solid #B8D9CA',
          }}>
            {thread.pod_name}
          </Badge>
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
                backgroundColor: '#F5EDD7',
                color: '#8B5E3C',
                border: '1px solid #D1C4A9',
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
          {thread.author_profile_picture ? (
            <img
              src={thread.author_profile_picture}
              alt=""
              style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: 22, height: 22, borderRadius: '50%', backgroundColor: '#e0e0e0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 600, color: '#666',
            }}>
              {getAuthorDisplayName().charAt(0).toUpperCase()}
            </div>
          )}
          <span style={{ color: '#555', fontWeight: 500 }}>{getAuthorDisplayName()}</span>
          <span style={{ color: '#999' }}>{formatDate(thread.created_at)}</span>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#757575' }}>
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

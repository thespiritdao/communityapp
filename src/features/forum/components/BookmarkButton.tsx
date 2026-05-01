// src/features/forum/components/BookmarkButton.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { getCurrentSession } from '@/features/identity';

interface BookmarkButtonProps {
  threadId: string;
  initialBookmarked?: boolean;
  size?: number;
}

export function BookmarkButton({ threadId, initialBookmarked = false, size = 18 }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [loading, setLoading] = useState(false);

  const getAuthToken = async (): Promise<string | null> => {
    const session = await getCurrentSession();
    return session?.access_token || null;
  };

  const toggle = async () => {
    const token = await getAuthToken();
    if (!token || loading) return;

    setLoading(true);
    try {
      if (bookmarked) {
        await fetch('/api/forum/bookmarks', {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId }),
        });
        setBookmarked(false);
      } else {
        await fetch('/api/forum/bookmarks', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ thread_id: threadId }),
        });
        setBookmarked(true);
      }
    } catch (err) {
      console.error('Bookmark toggle error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
      title={bookmarked ? 'Remove bookmark' : 'Bookmark this thread'}
      style={{
        background: 'none',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        opacity: loading ? 0.5 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <Bookmark
        size={size}
        fill={bookmarked ? '#8B5E3C' : 'none'}
        stroke={bookmarked ? '#8B5E3C' : '#8FAAA1'}
        style={{ transition: 'all 0.2s' }}
      />
    </button>
  );
}

// src/app/features/forum/components/ThreadCard.tsx

import type React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';

// Defensive CSS import with fallback
let styles: any = {};
try {
  styles = require('../styles/Forum.module.css');
} catch (error) {
  console.warn('Failed to load Forum.module.css, using fallback styles');
  styles = {
    threadCard: 'thread-card-fallback',
    threadMeta: 'thread-meta-fallback',
    postCountBadge: 'post-count-badge-fallback',
  };
}

interface Thread {
  id: string;
  title: string;
  author_wallet: string;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
  post_count?: number;
  category_name?: string;
  pod_name?: string | null;
}

interface ThreadCardProps {
  thread: Thread;
}

const ThreadCard: React.FC<ThreadCardProps> = ({ thread }) => {
  console.debug('ThreadCard received thread data:', thread);
  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch (error) {
      return 'Invalid date';
    }
  };

  const getAuthorDisplayName = () => {
    const { author_first_name, author_last_name, author_wallet } = thread;
    if (author_first_name && author_last_name) {
      return `${author_first_name} ${author_last_name}`;
    } else if (author_first_name) {
      return author_first_name;
    } else if (author_last_name) {
      return author_last_name;
    } else {
      return author_wallet
        ? author_wallet.slice(0, 6) + '...' + author_wallet.slice(-4)
        : 'Anon.';
    }
  };

  return (
    <Link
      href={`/forum/thread/${thread.id}`}
      className={styles.threadCard}
      style={{
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <h3 className={styles.threadTitle} style={{ fontSize: '0.95rem', margin: 0 }}>
          {thread.title}
        </h3>
        {thread.pod_name && (
          <Badge
            variant="secondary"
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
              backgroundColor: '#E8F1EE',
              color: '#2F5D50',
              border: '1px solid #B8D9CA',
            }}
          >
            {thread.pod_name}
          </Badge>
        )}
        {thread.category_name && (
          <Badge
            variant="outline"
            style={{
              fontSize: '0.7rem',
              padding: '2px 8px',
            }}
          >
            {thread.category_name}
          </Badge>
        )}
      </div>

      <div className={styles.threadMeta} style={{ gap: '8px' }}>
        <div className={styles.authorInfo} style={{ gap: '6px' }}>
          <span className={styles.authorName} style={{ fontSize: '0.8rem' }}>
            {getAuthorDisplayName()}
          </span>
          <span className={styles.threadDate} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            {formatDate(thread.created_at)}
          </span>
        </div>

        {thread.post_count !== undefined && (
          <div className={styles.postCountBadge} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
            {thread.post_count}{' '}
            {thread.post_count === 1 ? 'reply' : 'replies'}
          </div>
        )}
      </div>
    </Link>
  );
};

export default ThreadCard;

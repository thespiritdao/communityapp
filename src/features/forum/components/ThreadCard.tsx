// src/app/features/forum/components/ThreadCard.tsx


import React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import styles from '../styles/Forum.module.css';

interface Thread {
  id: string;
  title: string;
  author_wallet: string;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
  post_count?: number;
}

interface ThreadCardProps {
  thread: Thread;
}

const ThreadCard: React.FC<ThreadCardProps> = ({ thread }) => {
  console.debug("ThreadCard received thread data:", thread);
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
      return author_wallet ? author_wallet.slice(0, 6) + '...' + author_wallet.slice(-4) : 'Anon.';
    }
  };

  return (
    <Link href={`/forum/thread/${thread.id}`} className={styles.threadCard}>
      <div className={styles.threadCardContent}>
        <h3 className={styles.threadTitle}>{thread.title}</h3>
        
        <div className={styles.threadMeta}>
          <div className={styles.authorInfo}>
            <span className={styles.authorName}>
              {getAuthorDisplayName()}
            </span>
            <span className={styles.threadDate}>
              {formatDate(thread.created_at)}
            </span>
          </div>
          
          {thread.post_count !== undefined && (
            <div className={styles.postCountBadge}>
              {thread.post_count} {thread.post_count === 1 ? 'reply' : 'replies'}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ThreadCard;

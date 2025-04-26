
// src/app/features/forum/components/ThreadList.tsx
import React from 'react';
import Link from 'next/link';
import ThreadCard from './ThreadCard';
import styles from '../styles/Forum.module.css';

interface Thread {
  id: string;
  title: string;
  author_wallet: string;
  author_first_name: string | null;
  author_last_name: string | null;
  created_at: string;
  post_count: number;
  category_name: string;
}

interface ThreadListProps {
  threads: Thread[];        // threads are already fetched and filtered
  categoryName?: string;    // optional category name
}

const ThreadList: React.FC<ThreadListProps> = ({ threads, categoryName }) => {
  console.debug("Displaying threads:", threads);  // ✅ Debug log

  return (
    <div className={styles.threadListContainer}>
      {categoryName && (
        <div className={styles.categoryHeader}>
          <h2 className={styles.categoryTitle}>{categoryName}</h2>
          <Link href="/forum" className={styles.backLink}>
            Back to Categories
          </Link>
        </div>
      )}
      
      <div className={styles.threadListHeader}>
        <h3 className={styles.sectionTitle}>
          {categoryName ? `Threads in ${categoryName}` : 'Recent Threads'}
        </h3>

      </div>
      
      {threads.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No threads found in this category.</p>
          <p>Be the first to start a discussion!</p>
        </div>
      ) : (
        <ul className={styles.threadList}>
          {threads.map((thread) => (
            <li key={thread.id} className={styles.threadItem}>
              <ThreadCard thread={thread} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


export default ThreadList;

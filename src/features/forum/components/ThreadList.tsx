
// src/app/features/forum/components/ThreadList.tsx
import type React from 'react';
import Link from 'next/link';

// Defensive CSS import with fallback
let styles: any = {};
try {
  styles = require('../styles/Forum.module.css');
} catch (error) {
  console.warn('Failed to load Forum.module.css, using fallback styles');
  styles = {
    threadList: 'thread-list-fallback',
    threadItem: 'thread-item-fallback',
    loading: 'loading-fallback'
  };
}

// Defensive component import
let ThreadCard: React.ComponentType<any>;
try {
  ThreadCard = require('./ThreadCard').default;
} catch (error) {
  console.warn('Failed to load ThreadCard, using fallback');
  ThreadCard = ({ thread }: any) => (
    <div style={{ padding: '8px', border: '1px solid #ccc' }}>
      <h3>{thread.title}</h3>
      <p>Loading error - please refresh</p>
    </div>
  );
}

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

// src/app/forum/category/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from 'src/utils/supabaseClient';
import ForumContainer from 'src/features/forum/components/ForumContainer';
import styles from 'src/features/forum/styles/Forum.module.css';

export default function CategoryPage() {
  const { id: categoryId } = useParams(); // This is the category ID (UUID)
  const router = useRouter();
  const [threads, setThreads] = useState<any[]>([]);
  const [categoryName, setCategoryName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCategoryAndThreads() {
      setLoading(true);

      // 1) Optionally fetch the category name (if you store it in a table like forum_categories)
      //    If you don't store category data separately, skip this step
      const { data: catData, error: catError } = await supabase
        .from('forum_categories')
        .select('name')
        .eq('id', categoryId)
        .single();

      if (catError) {
        // Not necessarily fatal—maybe you just don't have a separate category table
        console.warn('Could not fetch category name:', catError.message);
      } else if (catData) {
        setCategoryName(catData.name);
      }

      // 2) Fetch all threads in this category
		const { data, error } = await supabase
		  .from('forum_threads')
		  .select(`
			id,
      categoryId:category_id,
			title,
			author_wallet,
			author_first_name, 
			author_last_name,  
			created_at
		  `)
		  .eq('category_id', categoryId)
		  .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setThreads(data || []);
      }
      setLoading(false);
    }

    if (categoryId) {
      fetchCategoryAndThreads();
    }
  }, [categoryId]);

  if (loading) {
    return (
      <ForumContainer>
        <p className={styles.loading}>Loading category...</p>
      </ForumContainer>
    );
  }

  if (error) {
    return (
      <ForumContainer>
        <p className={styles.error}>Error: {error}</p>
      </ForumContainer>
    );
  }

  return (
    <ForumContainer>
      <h2 className={styles.categoryTitle}>
        {/* If categoryName is available, show it; otherwise fallback to the ID */}
        {categoryName || `Category: ${categoryId}`}
      </h2>

      {/* Optional: Add a "Create Thread" button that pre-fills categoryId */}
      <div className={styles.threadListHeader}>
        <button
          className={styles.newThreadButton}
          onClick={() => router.push(`/forum/create-thread?categoryId=${categoryId}`)}
        >
          Create Thread
        </button>
      </div>

      {threads.length === 0 ? (
        <p className={styles.emptyState}>No threads found in this category.</p>
      ) : (
        <ul className={styles.threadList}>
          {threads.map((thread) => (
            <li key={thread.id} className={styles.threadItem}>
              {/* Link to the single thread route */}
              <a href={`/forum/thread/${thread.id}`} className={styles.threadCard}>
                <div className={styles.threadTitle}>{thread.title}</div>
                <div className={styles.threadMeta}>
                  <span>
					  By: {thread.author_first_name && thread.author_last_name
						? `${thread.author_first_name} ${thread.author_last_name}`
						: thread.author_first_name
						? thread.author_first_name
						: thread.author_last_name
						? thread.author_last_name
						: thread.author_wallet.slice(0, 6) + '...' + thread.author_wallet.slice(-4)}
					</span>
                  <span>{new Date(thread.created_at).toLocaleString()}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
	<div>
		<button
		  className={styles.ForumBackButton}
		  onClick={() => router.push('/forum')}
		  style={{ marginTop: '1rem' }}
		>
		  Back to Forum
		</button>
	</div>
    </ForumContainer>
  );
}
